// PostToolUse "*" — records views, edits and check commands in the conversation state file, runs a fast
// syntax check after edits, and queues notes that inject-context.mjs delivers on the next model call.
// Orchestrator mode (.agents/docs/architecture.md): records invoke_subagent dispatches (phase + T-id from the brief), links them
// to child conversation ids, and warns an ORCHESTRATOR once per file that edits it made itself belong to a worker,
// when a shell command it ran writes files, and when it send_messages a child that already reported.
// Output is always {} (PostToolUse cannot inject feedback directly). Contract: .agents/docs/architecture.md (hooks).
import fs from "node:fs";
import path from "node:path";
import {
  runHook, loadState, saveState, withStateLock, toAbs, relPath, normPath, findKey, hasViewed, addViewed, addPending,
  addCommand, isCodeFile, isLockfile, isEnvFile, classifyCommand, redact, unwrapArg, exitFromError, findCommandResult,
  resolvePending, readLastVerify, mergeLastVerify, applyOutcome, findTool, findPython, runTool, LIMITS, debug,
  isInside, pathKey, ensureRole, recordDispatches, linkChildren, subagentList, scanReplies, isWriteCommand, isCheckKind,
} from "./lib.mjs";
import { guardEnabled, isOrchestrator, waveProblems, workerRoster } from "./orchestrator-guard.mjs";

const EDIT_TOOLS = new Set(["write_to_file", "replace_file_content", "multi_replace_file_content"]);
const JSONC_NAMES = /^(tsconfig.*|jsconfig.*|\.eslintrc|devcontainer|\.devcontainer|biome|turbo|deno|launch|settings|tasks|extensions)\.json$/i;
const PY_CHECK = [
  "import sys",
  "p = sys.argv[1]",
  "try:",
  "    compile(open(p, 'rb').read(), p, 'exec', dont_inherit=True)",
  "except SyntaxError as e:",
  "    print('%s:%s:%s: SyntaxError: %s' % (p, e.lineno, e.offset, e.msg))",
  "    print((e.text or '').rstrip())",
  "    sys.exit(1)",
  "except Exception:",
  "    sys.exit(0)",
].join("\n");

function args(payload) {
  let a = payload.toolCall && payload.toolCall.args;
  if (typeof a === "string") { try { a = JSON.parse(a); } catch { a = {}; } }
  return a && typeof a === "object" ? a : {};
}
const truthy = (v) => v === true || v === "true" || unwrapArg(v) === "true";

// Lenient JSONC parse (comments + trailing commas) for config files that officially allow them.
function parseJsonc(text) {
  let out = "";
  for (let i = 0, inStr = false; i < text.length; i++) {
    const c = text[i];
    if (inStr) { out += c; if (c === "\\") { out += text[++i] ?? ""; } else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && text[i + 1] === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

// Returns error text, or null when the file is fine / the check does not apply / the tool is missing.
function syntaxCheck(abs, ctx) {
  let st;
  try { st = fs.statSync(abs); } catch { return null; }
  if (!st.isFile() || st.size > 2 * 1024 * 1024) return null;
  const ext = path.extname(abs).toLowerCase();
  if (ext === ".json") {
    let text;
    try { text = fs.readFileSync(abs, "utf8").replace(/^﻿/, ""); } catch { return null; }
    if (!text.trim()) return null;
    try { JSON.parse(text); return null; } catch (e) {
      if (JSONC_NAMES.test(path.basename(abs)) || /\/\.vscode\//i.test(normPath(abs))) {
        try { parseJsonc(text); return null; } catch { /* report the strict error */ }
      }
      return `JSON.parse: ${e.message}`;
    }
  }
  let tool = null;
  let targs = null;
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") { tool = process.execPath; targs = ["--check", abs]; }
  else if (ext === ".py") { tool = findPython(ctx.stateDir); targs = ["-c", PY_CHECK, abs]; }
  else if (ext === ".php") { tool = findTool(ctx.stateDir, "php"); targs = ["-l", abs]; }
  else if (ext === ".go") { tool = findTool(ctx.stateDir, "gofmt"); targs = ["-l", "-e", abs]; }
  if (!tool) return null;
  const r = runTool(tool, targs, { timeout: 6000, cwd: ctx.root });
  if (r.error || r.status === 0 || r.status === null) return null; // timeout / spawn failure -> skip silently
  const out = `${r.stderr || ""}\n${r.stdout || ""}`.trim();
  // node --check false positives for bundler-only JS (JSX in .js, ESM in a CommonJS package on old Node)
  if (ext === ".js" && /Unexpected token '<'|Cannot use import statement outside a module|Unexpected token 'export'/.test(out)) return null;
  return out || `exit code ${r.status}`;
}

function firstLines(text, abs, rel, n = 12) {
  const win = abs.replace(/\//g, "\\");
  return text.split(win).join(rel).split(abs).join(rel)
    .split(/\r?\n/).filter((l) => l.trim() && !/^Node\.js v\d/.test(l))
    .slice(0, n).map((l) => (l.length > 200 ? l.slice(0, 200) + "…" : l)).join("\n");
}

function handleEdit(state, ctx, tool, a, now) {
  const abs = toAbs(unwrapArg(a.TargetFile), ctx.root);
  if (!abs) return;
  const rel = relPath(abs, ctx.root);
  const key = findKey(state.edits, abs) || abs;
  const prior = state.edits[key];
  const code = isCodeFile(abs, ctx.root);
  state.edits[key] = { count: (prior ? prior.count : 0) + 1, lastTs: now, code };
  const keys = Object.keys(state.edits);
  if (keys.length > LIMITS.edits) {
    keys.sort((x, y) => state.edits[x].lastTs - state.edits[y].lastTs).slice(0, keys.length - LIMITS.edits)
      .forEach((k) => delete state.edits[k]);
  }
  state.lastEditTs = now;
  if (code) state.lastCodeEditTs = now;

  if (isLockfile(abs)) addPending(state, `Lockfile ${rel} was edited directly: revert; use the package manager to change dependencies (it rewrites the lockfile).`);
  if (isEnvFile(abs)) addPending(state, `Warning: you edited ${rel}. Never commit real secrets; keep .env files gitignored and document keys in .env.example.`);

  // Edited an existing file that was never viewed (or written) in this conversation.
  let existed = tool !== "write_to_file" || truthy(a.Overwrite);
  if (existed && tool === "write_to_file") {
    try { const b = fs.statSync(abs).birthtimeMs; if (b > 0 && b >= now - 10000) existed = false; } catch { /* keep */ }
  }
  if (existed && !prior && !hasViewed(state, abs)) {
    addPending(state, `You edited ${rel} without viewing it first in this conversation: view it first next time; re-read ${rel} now to confirm the edit is correct.`);
  }

  const err = syntaxCheck(abs, ctx);
  if (err) addPending(state, `Syntax check failed for ${rel}: ${firstLines(err, abs, rel)}`);
  debug(ctx, { hook: "track", tool, code, syntax: err ? "fail" : "ok" });
}

// invoke_subagent({"Subagents":[{"TypeName","Role","Prompt","Workspace"}]}) -> one dispatch per entry. A wave that
// orchestrator-guard denied (same checks) is never recorded, in case PostToolUse fires for it without an error.
function handleDispatch(state, ctx, a, now) {
  const subs = subagentList(a.Subagents);
  if (guardEnabled() && isOrchestrator(ctx) && waveProblems(subs, workerRoster(), ctx.root).length) {
    debug(ctx, { hook: "track", tool: "invoke_subagent", dispatched: 0, denied: true });
    return;
  }
  const n = recordDispatches(state, subs, now, ctx.payload.stepIdx);
  debug(ctx, { hook: "track", tool: "invoke_subagent", dispatched: n });
}

// Orchestrators never edit workspace files: queue one note per file (.agents/docs/architecture.md).
function warnOrchestratorEdit(state, ctx, a) {
  const abs = toAbs(unwrapArg(a.TargetFile), ctx.root);
  if (!abs || !isInside(abs, ctx.root)) return;
  const k = pathKey(abs);
  if (state.orchestratorEditWarned.some((p) => pathKey(p) === k)) return;
  state.orchestratorEditWarned.push(normPath(abs));
  if (state.orchestratorEditWarned.length > LIMITS.dispatches) state.orchestratorEditWarned = state.orchestratorEditWarned.slice(-LIMITS.dispatches);
  addPending(state, `[orchestrator] You edited ${relPath(abs, ctx.root)} yourself. Orchestrator mode: file changes are IMPLEMENT/FIX tasks for an implementer or fixer worker. Dispatch one (or have a reviewer check this edit) — do not edit further files yourself.`);
}

// Orchestrators never change files through the shell either: queue a note per command (gap 1).
function warnOrchestratorWrite(state, cmd) {
  const shown = redact(cmd).replace(/\s+/g, " ").trim();
  const c = shown.length > 90 ? shown.slice(0, 90) + "…" : shown;
  addPending(state, `[orchestrator] \`${c}\` writes files. That is a worker task: dispatch an implementer or fixer with it in ALLOWED COMMANDS (lessons.mjs writes belong to the scribe in LEARN).`);
}

// send_message({Recipient, Message}) to a child that already reported: new work needs a new dispatch (gap 12).
function checkMessage(state, ctx, a) {
  const to = String(unwrapArg(a.Recipient) ?? "").trim();
  const c = to && state.children[to];
  if (!c) return;
  if (c.repliedTs === null) scanReplies(state, ctx);
  if (c.repliedTs === null || c.status === "BLOCKED") return; // still working, or answering its INPUT GAP
  addPending(state, `[orchestrator] ${c.type}${c.task ? ` ${c.task}` : ""} already reported. send_message to a worker only answers its INPUT GAP for the same task; new work = new dispatch (invoke_subagent, new brief).`);
}

function handleCommand(state, ctx, a, err, now, role) {
  const cmd = String(unwrapArg(a.CommandLine) ?? "");
  const kind = classifyCommand(cmd);
  const entry = { ts: now, cmd: redact(cmd).slice(0, LIMITS.cmdChars), kind, exit: null };
  if (role === "orchestrator" && isWriteCommand(cmd)) warnOrchestratorWrite(state, cmd);
  if (isCheckKind(kind)) {
    let exit = null;
    let doneTs = now;
    if (kind === "verify") {
      const lv = readLastVerify(ctx);
      const lower = (state.lastInvocationTs || state.createdAt) - 1000;
      if (lv && lv.ts >= lower) { exit = lv.ok ? 0 : 1; doneTs = Math.min(lv.ts, now); }
    }
    if (exit === null) exit = exitFromError(err);
    if (exit === null) {
      const r = findCommandResult(ctx, cmd, ctx.payload.stepIdx);
      exit = r.exit;
      if (r.taskId) entry.taskId = r.taskId;
      else if (exit === null && Number.isInteger(r.resIdx)) entry.resIdx = r.resIdx;
      if (exit === null && !r.taskId && r.resIdx === null && Number.isInteger(ctx.payload.stepIdx)) entry.resIdx = ctx.payload.stepIdx;
    }
    entry.exit = exit;
    applyOutcome(state, kind, exit, exit === 0 ? doneTs : now);
  }
  addCommand(state, entry);
  debug(ctx, { hook: "track", tool: "run_command", kind, exit: entry.exit, bg: !!entry.taskId });
}

async function main(payload, ctx) {
  if (!payload) return {};
  const now = Date.now();
  const tool = payload.toolCall && typeof payload.toolCall.name === "string" ? payload.toolCall.name : "";
  const a = args(payload);
  const err = typeof payload.error === "string" ? payload.error.trim() : payload.error ? String(payload.error) : "";

  withStateLock(ctx, () => {
    const state = loadState(ctx);
    if (err) state.toolErrors += 1;
    const role = ensureRole(state, ctx);

    if (tool === "view_file") {
      if (!err) addViewed(state, toAbs(unwrapArg(a.AbsolutePath), ctx.root));
    } else if (EDIT_TOOLS.has(tool)) {
      if (!err) {
        handleEdit(state, ctx, tool, a, now);
        // role null: no warning (a worker whose transcript head and parent marker are not readable yet must not be
        // told to stop editing). Deliberate deviation from the original orchestrator design ("null treated as orchestrator").
        if (role === "orchestrator") warnOrchestratorEdit(state, ctx, a);
      }
    } else if (tool === "run_command") {
      handleCommand(state, ctx, a, err, now, role);
    } else if (tool === "invoke_subagent") {
      if (!err && role !== "worker") handleDispatch(state, ctx, a, now);
    } else if (tool === "send_message") {
      if (!err && role === "orchestrator") checkMessage(state, ctx, a);
    }
    if (state.dispatches.some((d) => !d.child)) linkChildren(state, ctx);
    resolvePending(state, ctx);
    mergeLastVerify(state, readLastVerify(ctx));
    saveState(ctx, state);
  });
  return {};
}

runHook({ name: "track-tools", fallback: {}, budgetMs: 13000, main });
