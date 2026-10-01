// PreToolUse write_to_file|replace_file_content|multi_replace_file_content|invoke_subagent — hard orchestrator rules.
// Denies ONLY in a conversation that is positively the ORCHESTRATOR (transcript step 0 is a USER_INPUT with no
// dispatch-brief markers, no parent marker, not cached as a worker):
//  (1) an edit tool targeting a path inside the workspace (Antigravity artifacts under ~/.gemini pass);
//  (2) an invoke_subagent wave with > 3 entries, a TypeName outside the worker roster (.agents/agents/, never
//      self / research / browser / orchestrator), a Prompt without exactly one "TASK: T<n>" id, exactly one
//      "OBJECTIVE:" line, an "OWNED FILES:" line and a "DONE WHEN:" line, or two writers sharing an OWNED FILES path.
// Workers, unknown roles and every allowed call get guard.config.json "orchestratorGuardPassthrough" ("allow" by
// default, or "ask"). ALWAYS prints an explicit decision: `{}` would DENY the tool (VERIFIED). Internal error or
// malformed stdin -> the passthrough decision (fail-open: never deny by accident).
import fs from "node:fs";
import path from "node:path";
import {
  runHook, readJson, unwrapArg, isEntry, HOOKS_DIR, KIT_DIR, debug, toAbs, isInside, expandHome, pathKey,
  hasParentMarker, transcriptFiles, readHead, headInfo, statePath, subagentList, WORKER_TYPES, WRITER_TYPES,
} from "./lib.mjs";

const EDIT_TOOLS = new Set(["write_to_file", "replace_file_content", "multi_replace_file_content"]);
const PASSTHROUGH = new Set(["allow", "ask"]);
const NEVER = new Set(["self", "research", "browser", "orchestrator"]);
const MAX_WAVE = 3;
export const EDIT_DENY = "[orchestrator] You never edit workspace files. Dispatch an implementer (new change) or fixer (review findings) with this change as its OBJECTIVE and the file in OWNED FILES.";

export function passthroughDecision(file = path.join(HOOKS_DIR, "guard.config.json")) {
  try {
    const j = readJson(file);
    const d = j && typeof j === "object" ? j.orchestratorGuardPassthrough : undefined;
    return PASSTHROUGH.has(d) ? d : "allow";
  } catch { return "allow"; }
}

// Worker TypeNames: .agents/agents/<name>.md or <name>/agent.md (frontmatter name wins), minus the orchestrator,
// main agents and built-ins. Unreadable / empty directory -> the built-in roster.
export function workerRoster(agentsDir = path.join(KIT_DIR, "agents")) {
  const names = new Set();
  let ents = [];
  try { ents = fs.readdirSync(agentsDir, { withFileTypes: true }); } catch { ents = []; }
  for (const e of ents) {
    let file = null;
    let base = null;
    if (e.isFile() && /\.md$/i.test(e.name)) { file = path.join(agentsDir, e.name); base = e.name.replace(/\.md$/i, ""); }
    else if (e.isDirectory()) { file = path.join(agentsDir, e.name, "agent.md"); base = e.name; }
    if (!file) continue;
    let head = "";
    try { head = fs.readFileSync(file, "utf8").slice(0, 2000); } catch { continue; }
    const fm = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(head);
    const yaml = fm ? fm[1] : "";
    const nm = /^name:\s*["']?([\w.-]+)["']?\s*$/m.exec(yaml);
    const name = (nm ? nm[1] : base).toLowerCase();
    if (/^subagent:\s*false\s*$/m.test(yaml) || NEVER.has(name)) continue;
    names.add(name);
  }
  return names.size ? names : new Set(WORKER_TYPES);
}

// true when frontier-orchestrator-guard is enabled in .agents/hooks.json (track-tools skips waves it denied).
export function guardEnabled(file = path.join(KIT_DIR, "hooks.json")) {
  try { const e = readJson(file)["frontier-orchestrator-guard"]; return !!e && e.enabled !== false; } catch { return false; }
}

// Positively the orchestrator: step 0 of the transcript is a USER_INPUT without brief markers, and nothing says
// worker (parent marker, cached role). Unknown / unreadable -> false (never deny).
export function isOrchestrator(ctx) {
  if (hasParentMarker(ctx)) return false;
  const st = readJson(statePath(ctx));
  if (st && st.role === "worker") return false;
  for (const f of transcriptFiles(ctx.payload.transcriptPath)) {
    const h = headInfo(readHead(f));
    if (h) return !h.worker && h.type === "USER_INPUT";
  }
  return false;
}

const count = (re, s) => (s.match(re) || []).length;
// OWNED FILES entries of a brief ([] for read-only / none): { key (comparable), raw (as written) }. Quoted spans are
// one path (spaces allowed); other items split on , ; | and whitespace ("a.ts and b.ts"); a multi-word item keeps
// only its path-like words (containing / \ . or *).
function ownedEntries(prompt, root) {
  const m = /^[ \t>*-]*OWNED FILES:[ \t]*(.*)$/m.exec(prompt);
  if (!m) return [];
  const toks = [];
  const rest = m[1].replace(/\([^)]*\)/g, " ")
    .replace(/`([^`]+)`|"([^"]+)"|'([^'\s]+)'/g, (_x, a, b, c) => { toks.push(String(a ?? b ?? c).trim()); return ","; });
  for (const item of rest.split(/[,;|]/)) {
    const t = item.trim();
    if (!/\s/.test(t)) toks.push(t);
    else toks.push(...t.split(/\s+/).filter((w) => /[/\\.*]/.test(w)));
  }
  return toks.map((t) => t.replace(/(\w)[.:]$/, "$1"))
    .filter((t) => t && !/^(?:read-only|none|n\/a|-|and)$/i.test(t))
    .map((t) => ({ key: pathKey(toAbs(t, root)).replace(/\/\*\*?$|\/$/, ""), raw: t }));
}
export const ownedFiles = (prompt, root) => ownedEntries(prompt, root).map((e) => e.key);
const overlaps = (a, b) => a === b || a.startsWith(b + "/") || b.startsWith(a + "/");

// Problems of one wave, [] when it is fine. `root` resolves relative OWNED FILES paths.
export function waveProblems(subagents, roster, root) {
  const out = [];
  const list = subagents.filter((x) => x && typeof x === "object");
  if (list.length > MAX_WAVE) out.push(`the wave has ${list.length} entries (max ${MAX_WAVE} per invoke_subagent; dispatch the rest after these report)`);
  const writers = [];
  list.forEach((sa, i) => {
    const type = String(unwrapArg(sa.TypeName) ?? "").trim();
    const t = type.toLowerCase();
    const who = `entry ${i + 1} (${type || "no TypeName"})`;
    if (!roster.has(t) || NEVER.has(t)) {
      out.push(`${who}: TypeName is not a worker agent; use one of ${[...roster].sort().join(", ")} (never self/research/browser/orchestrator)`);
    }
    const prompt = String(unwrapArg(sa.Prompt) ?? "");
    const taskLines = [...prompt.matchAll(/\bTASK:[ \t]*([^\n|]*)/g)];
    const ids = taskLines.length ? taskLines[0][1].match(/\bT\d+[a-z]?\b/g) || [] : [];
    if (taskLines.length !== 1 || ids.length !== 1) {
      const why = !taskLines.length ? 'no "TASK: T<n>" line' : taskLines.length > 1 ? `${taskLines.length} "TASK:" lines` : ids.length ? `${ids.length} task ids (${ids.join(", ")})` : 'no task id in "TASK:" (write TASK: T<n>)';
      out.push(`${who}: Prompt has ${why}; one worker runs exactly one task (one entry per task)`);
    }
    const obj = count(/^[ \t>*-]*OBJECTIVE:/gm, prompt);
    if (obj !== 1) out.push(`${who}: Prompt has ${obj} "OBJECTIVE:" lines (exactly one outcome per worker)`);
    if (!/^[ \t>*-]*OWNED FILES:/m.test(prompt)) out.push(`${who}: Prompt has no "OWNED FILES:" line (files or read-only)`);
    if (!/^[ \t>*-]*DONE WHEN:/m.test(prompt)) out.push(`${who}: Prompt has no "DONE WHEN:" line`);
    const ws = String(unwrapArg(sa.Workspace) ?? "").trim().toLowerCase();
    if (WRITER_TYPES.has(t) && ws !== "branch") writers.push({ who, files: ownedEntries(prompt, root) });
  });
  for (let i = 0; i < writers.length; i++) {
    for (let j = i + 1; j < writers.length; j++) {
      const hit = writers[i].files.find((a) => writers[j].files.some((b) => overlaps(a.key, b.key)));
      if (hit) out.push(`${writers[i].who} and ${writers[j].who} both own ${hit.raw} (writers in one wave need disjoint OWNED FILES)`);
    }
  }
  return out;
}

export function decide(payload, ctx, pass = passthroughDecision(), roster) {
  const allow = { decision: pass };
  const tc = payload && payload.toolCall && typeof payload.toolCall === "object" ? payload.toolCall : {};
  const name = typeof tc.name === "string" ? tc.name : "";
  if (!EDIT_TOOLS.has(name) && name !== "invoke_subagent") return allow;
  let a = tc.args;
  if (typeof a === "string") { try { a = JSON.parse(a); } catch { a = {}; } }
  a = a && typeof a === "object" ? a : {};
  if (!isOrchestrator(ctx)) return allow;
  if (EDIT_TOOLS.has(name)) {
    const target = expandHome(String(unwrapArg(a.TargetFile) ?? "").trim());
    if (!target) return allow;
    const abs = toAbs(target, ctx.root);
    const roots = [ctx.root, ...(Array.isArray(ctx.payload.workspacePaths) ? ctx.payload.workspacePaths : [])];
    return roots.some((r) => typeof r === "string" && isInside(abs, r)) ? { decision: "deny", reason: EDIT_DENY } : allow;
  }
  const subs = subagentList(a.Subagents);
  if (!subs.length) return allow; // the tool rejects an empty call itself
  const problems = waveProblems(subs, roster || workerRoster(), ctx.root);
  if (!problems.length) return allow;
  return {
    decision: "deny",
    reason: `[orchestrator] invoke_subagent refused, nothing was dispatched: ${problems.join("; ")}. Fix the wave and call invoke_subagent again (brief template: TASK: T<n> | PHASE | AGENT, OBJECTIVE, OWNED FILES, DONE WHEN; see /orchestrate).`,
  };
}

async function main(payload, ctx) {
  const pass = passthroughDecision();
  if (!payload) return { decision: pass };
  const out = decide(payload, ctx, pass);
  debug(ctx, { hook: "orchestrator-guard", tool: payload.toolCall && payload.toolCall.name, decision: out.decision });
  return out && typeof out.decision === "string" ? out : { decision: pass };
}

if (isEntry(import.meta.url)) runHook({ name: "orchestrator-guard", fallback: { decision: passthroughDecision() }, budgetMs: 4000, main });
