// Frontier Kit — shared hook helpers. Node builtins only (Node >= 18, ESM).
// Contract: .agents/docs/architecture.md (hooks). Every hook prints exactly ONE JSON object on stdout and nothing on stderr.
// Debug logging only when AGENT_KIT_HOOK_DEBUG=1 -> <state>/hook-debug.log (no env values, secrets or file contents).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const KIT_DIR = path.dirname(HOOKS_DIR);
export const IS_WIN = process.platform === "win32";
export const VERIFY_CMD = "node .agents/scripts/verify.mjs";
export const LIMITS = { viewed: 400, commands: 60, pending: 10, edits: 500, cmdChars: 200, dispatches: 100 };
const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- output / runner
let emitted = false;
export function emit(obj) {
  if (emitted) return;
  emitted = true;
  let s = "{}";
  try { s = JSON.stringify(obj && typeof obj === "object" ? obj : {}); } catch { s = "{}"; }
  try { process.stdout.write(s + "\n"); } catch { /* nothing else we can do */ }
}

export function isEntry(metaUrl) {
  try {
    return !!process.argv[1] && pathKey(fileURLToPath(metaUrl)) === pathKey(path.resolve(process.argv[1]));
  } catch { return false; }
}

// Runs a hook: reads stdin, calls main(payload, ctx), prints its result (or `fallback` on any error/timeout).
export function runHook({ name, fallback, budgetMs, main }) {
  const started = Date.now();
  const ctxBox = { ctx: null };
  const bail = (why) => {
    debug(ctxBox.ctx, { hook: name, fail: why });
    emit(fallback);
  };
  process.on("uncaughtException", (e) => { bail(errInfo(e)); });
  process.on("unhandledRejection", (e) => { bail(errInfo(e)); });
  const watchdog = setTimeout(() => {
    bail("watchdog");
    try { process.stdout.write("", () => process.exit(0)); } catch { process.exit(0); }
  }, budgetMs);
  watchdog.unref();
  (async () => {
    try {
      const raw = await readStdin(3000);
      const payload = parsePayload(raw);
      const ctx = makeCtx(payload);
      ctxBox.ctx = ctx;
      const out = await main(payload, ctx);
      emit(out && typeof out === "object" ? out : fallback);
      debug(ctx, { hook: name, ms: Date.now() - started, out: summarizeOut(out) });
    } catch (e) {
      bail(errInfo(e));
    } finally {
      clearTimeout(watchdog);
    }
  })();
}

function summarizeOut(out) {
  if (!out || typeof out !== "object") return "none";
  if (out.decision) return "decision:" + out.decision;
  if (Array.isArray(out.injectSteps)) return "inject:" + out.injectSteps.length;
  return "empty";
}

export function readStdin(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let done = false;
    let timer = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      try { process.stdin.pause(); process.stdin.destroy(); } catch { /* ignore */ }
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    try {
      if (process.stdin.isTTY) return finish();
      timer = setTimeout(finish, timeoutMs);
      process.stdin.on("data", (c) => {
        const b = typeof c === "string" ? Buffer.from(c) : c;
        chunks.push(b);
        size += b.length;
        if (size > 8 * 1024 * 1024) finish();
      });
      process.stdin.on("end", finish);
      process.stdin.on("error", finish);
    } catch { finish(); }
  });
}

export function parsePayload(raw) {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/^﻿/, "").trim();
  if (!t) return null;
  try {
    const o = JSON.parse(t);
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- paths
export function normPath(p) {
  if (typeof p !== "string") return "";
  let s = p.trim();
  if (!s) return "";
  if (/^file:\/\//i.test(s)) {
    try { s = fileURLToPath(s); } catch { s = decodeURI(s.replace(/^file:\/\/\/?/i, "")); }
  }
  s = s.replace(/\\/g, "/");
  if (IS_WIN && /^\/[a-zA-Z](\/|$)/.test(s)) s = s[1] + ":" + (s.slice(2) || "/"); // git-bash style /c/...
  const unc = s.startsWith("//");
  s = path.posix.normalize(s);
  if (unc && !s.startsWith("//")) s = "/" + s;
  if (/^[a-zA-Z]:/.test(s)) s = s[0].toUpperCase() + s.slice(1);
  if (/^[A-Z]:$/.test(s)) s += "/";
  if (s.length > 1 && s.endsWith("/") && !/^[A-Z]:\/$/.test(s) && s !== "//") s = s.slice(0, -1);
  return s;
}
export function pathKey(p) {
  const n = normPath(p);
  return IS_WIN ? n.toLowerCase() : n;
}
export function isAbs(p) {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("/") || p.startsWith("\\\\") || /^file:\/\//i.test(p);
}
export function toAbs(p, root) {
  if (typeof p !== "string" || !p.trim()) return "";
  return isAbs(p.trim()) ? normPath(p) : normPath(root + "/" + p.trim());
}
export function isInside(abs, root) {
  if (!abs || !root) return false;
  const a = pathKey(abs);
  const r = pathKey(root).replace(/\/$/, "");
  return a.startsWith(r + "/");
}
export function relPath(abs, root) {
  const a = normPath(abs);
  return isInside(a, root) ? a.slice(normPath(root).replace(/\/$/, "").length + 1) : a;
}
export function expandHome(p) {
  if (typeof p !== "string") return "";
  return /^~(?=$|[\\/])/.test(p) ? path.join(os.homedir(), p.slice(1)) : p;
}

// Workspace root: the payload workspace that owns this kit, else workspacePaths[0], else parent of CWD (.agents).
export function resolveRoot(payload) {
  const wps = Array.isArray(payload && payload.workspacePaths)
    ? payload.workspacePaths.filter((p) => typeof p === "string" && p.trim()).map(normPath)
    : [];
  const kitParent = normPath(path.dirname(KIT_DIR));
  const own = wps.find((p) => pathKey(p) === pathKey(kitParent));
  if (own) return own;
  if (wps.length) return wps[0];
  const cwd = process.cwd();
  if (/^[._]agents?$/i.test(path.basename(cwd))) return normPath(path.dirname(cwd));
  return kitParent;
}

export function makeCtx(payload) {
  const root = resolveRoot(payload);
  let stateDir = path.join(KIT_DIR, ".state");
  try {
    if (fs.statSync(path.join(root, ".agents")).isDirectory()) stateDir = path.join(root, ".agents", ".state");
  } catch { /* keep kit-local state dir */ }
  let convId = payload && typeof payload.conversationId === "string" && payload.conversationId
    ? payload.conversationId
    : process.env.ANTIGRAVITY_CONVERSATION_ID || "unknown";
  convId = safeId(convId) || "unknown";
  return { payload: payload || {}, root, stateDir, convId, transcript: undefined };
}
// Conversation id -> safe file-name part (also used for child markers, so parent and child agree).
export const safeId = (id) => String(id).replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 100);

// ---------------------------------------------------------------- json / state IO
export function readJson(file) {
  try {
    const t = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
    return JSON.parse(t);
  } catch { return null; }
}

function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* ignore */ }
}

export function ensureStateDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const gi = path.join(dir, ".gitignore");
  try { if (!fs.existsSync(gi)) fs.writeFileSync(gi, "*\n"); } catch { /* ignore */ }
}

export function writeJsonAtomic(file, obj) {
  ensureStateDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj));
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, file); return; } catch (e) {
      if (i >= 4) { try { fs.unlinkSync(tmp); } catch { /* ignore */ } throw e; }
      sleepSync(20 * (i + 1));
    }
  }
}

export function appendLine(file, obj, maxBytes = 2 * 1024 * 1024) {
  ensureStateDir(path.dirname(file));
  try {
    if (fs.statSync(file).size > maxBytes) fs.renameSync(file, file.replace(/(\.\w+)?$/, ".1$1"));
  } catch { /* missing file is fine */ }
  fs.appendFileSync(file, JSON.stringify(obj) + "\n");
}

export function freshState(convId) {
  const now = Date.now();
  return {
    v: 1, conversationId: convId, createdAt: now, updatedAt: now, invocations: 0,
    edits: {}, lastEditTs: 0, lastCodeEditTs: 0, viewed: [], commands: [],
    lastVerifyPassTs: 0, lastVerifyFailTs: 0, sawFailThenPass: false, toolErrors: 0, pending: [],
    // pipelineFor = "<round key>|<missing list>": the PIPELINE GATE's 2-block budget renews on progress
    gate: { blocks: 0, totalBlocks: 0, learningNudged: false, tamperNudged: false, pipelineBlocks: 0, pipelineFor: "" },
    lastInvocationTs: 0,
    // hooks v2 (.agents/docs/architecture.md)
    role: null, children: {}, dispatches: [], orchestratorEditWarned: [],
  };
}

const num = (v, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const STATUSES = new Set(["PASS", "FAIL", "BLOCKED"]);
// A stored phase (from the brief) when valid, else the TypeName map.
const validPhase = (p, type) => (typeof p === "string" && ([...PHASES, "CONSULT", "OTHER"]).includes(p) ? p : phaseOf(type));

export function sanitizeState(raw, convId) {
  const s = freshState(convId);
  if (!raw || typeof raw !== "object" || raw.v !== 1) return s;
  s.createdAt = num(raw.createdAt, s.createdAt);
  s.updatedAt = num(raw.updatedAt, s.updatedAt);
  s.invocations = num(raw.invocations);
  s.lastEditTs = num(raw.lastEditTs);
  s.lastCodeEditTs = num(raw.lastCodeEditTs);
  s.lastVerifyPassTs = num(raw.lastVerifyPassTs);
  s.lastVerifyFailTs = num(raw.lastVerifyFailTs);
  s.lastInvocationTs = num(raw.lastInvocationTs);
  s.sawFailThenPass = raw.sawFailThenPass === true;
  s.toolErrors = num(raw.toolErrors);
  if (raw.edits && typeof raw.edits === "object" && !Array.isArray(raw.edits)) {
    for (const [k, e] of Object.entries(raw.edits)) {
      if (e && typeof e === "object") s.edits[k] = { count: num(e.count, 1), lastTs: num(e.lastTs), code: e.code === true };
    }
  }
  if (Array.isArray(raw.viewed)) s.viewed = raw.viewed.filter((p) => typeof p === "string").slice(-LIMITS.viewed);
  if (Array.isArray(raw.commands)) {
    s.commands = raw.commands.filter((c) => c && typeof c === "object" && typeof c.cmd === "string").slice(-LIMITS.commands);
  }
  if (Array.isArray(raw.pending)) {
    s.pending = raw.pending.filter((p) => p && typeof p.text === "string").slice(-LIMITS.pending);
  }
  if (raw.gate && typeof raw.gate === "object") {
    s.gate.blocks = num(raw.gate.blocks);
    s.gate.totalBlocks = num(raw.gate.totalBlocks, s.gate.blocks);
    s.gate.learningNudged = raw.gate.learningNudged === true;
    s.gate.tamperNudged = raw.gate.tamperNudged === true;
    s.gate.pipelineBlocks = num(raw.gate.pipelineBlocks);
    s.gate.pipelineFor = typeof raw.gate.pipelineFor === "string" ? raw.gate.pipelineFor.slice(0, 200) : "";
  }
  if (raw.role === "orchestrator" || raw.role === "worker") s.role = raw.role;
  if (raw.children && typeof raw.children === "object" && !Array.isArray(raw.children)) {
    for (const [id, c] of Object.entries(raw.children)) {
      if (!c || typeof c !== "object") continue;
      const type = typeof c.type === "string" ? c.type : "";
      s.children[id] = {
        type, role: typeof c.role === "string" ? c.role : "", phase: validPhase(c.phase, type),
        task: typeof c.task === "string" ? c.task : "",
        dispatchedTs: num(c.dispatchedTs), repliedTs: typeof c.repliedTs === "number" ? c.repliedTs : null,
        status: STATUSES.has(c.status) ? c.status : null,
      };
    }
  }
  if (Array.isArray(raw.dispatches)) {
    s.dispatches = raw.dispatches.filter((d) => d && typeof d === "object" && typeof d.ts === "number" && typeof d.type === "string")
      .map((d) => ({
        ts: d.ts, type: d.type, phase: validPhase(d.phase, d.type), step: Number.isInteger(d.step) ? d.step : null,
        child: typeof d.child === "string" ? d.child : null, role: typeof d.role === "string" ? d.role : "",
        task: typeof d.task === "string" ? d.task : "",
      }))
      .slice(-LIMITS.dispatches);
  }
  if (Array.isArray(raw.orchestratorEditWarned)) {
    s.orchestratorEditWarned = raw.orchestratorEditWarned.filter((p) => typeof p === "string").slice(-LIMITS.dispatches);
  }
  return s;
}

export function statePath(ctx) {
  return path.join(ctx.stateDir, `conv-${ctx.convId}.json`);
}
export function loadState(ctx) {
  return sanitizeState(readJson(statePath(ctx)), ctx.convId);
}
export function saveState(ctx, state) {
  state.updatedAt = Date.now();
  writeJsonAtomic(statePath(ctx), state);
}

const LOCK_WAIT_MS = 3000;
const LOCK_STALE_MS = 8000;

// Best-effort cross-process mutex over `file`, using an atomically-created lock directory (mkdirSync with
// no `recursive` throws EEXIST when the dir is already there, on every platform we run on). Bounded: gives
// up and proceeds UNLOCKED once LOCK_WAIT_MS has passed, so a stuck lock can never hang a hook past its own
// timeout budget (a rare lost update from that fallback is preferable to a hung hook). A lock dir older
// than LOCK_STALE_MS is treated as abandoned by a crashed process and removed.
export function acquireLock(file) {
  const lockDir = `${file}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      return () => { try { fs.rmdirSync(lockDir); } catch { /* ignore */ } };
    } catch (e) {
      if (!e || e.code !== "EEXIST") return () => {}; // parent missing or other FS error: proceed unlocked
    }
    try {
      const age = Date.now() - fs.statSync(lockDir).mtimeMs;
      if (age > LOCK_STALE_MS) { try { fs.rmdirSync(lockDir); } catch { /* ignore */ } continue; }
    } catch { continue; } // lock vanished between our mkdir and stat: retry immediately
    if (Date.now() >= deadline) return () => {}; // give up rather than risk the hook's own timeout
    sleepSync(10 + Math.floor(Math.random() * 25));
  }
}

// Runs fn() with this conversation's loadState()->mutate->saveState serialized across processes (best
// effort; see acquireLock). Use this to wrap the whole read-modify-write section in every hook that touches
// conv-<id>.json, so two hooks racing on the same conversation never silently drop each other's update.
export function withStateLock(ctx, fn) {
  try { ensureStateDir(ctx.stateDir); } catch { /* acquireLock proceeds unlocked if this fails */ }
  const release = acquireLock(statePath(ctx));
  try { return fn(); } finally { release(); }
}

// ---------------------------------------------------------------- state helpers
export function findKey(obj, abs) {
  const k = pathKey(abs);
  for (const key of Object.keys(obj)) if (pathKey(key) === k) return key;
  return null;
}
export function hasViewed(state, abs) {
  const k = pathKey(abs);
  return state.viewed.some((p) => pathKey(p) === k);
}
export function addViewed(state, abs) {
  if (!abs) return;
  const k = pathKey(abs);
  state.viewed = state.viewed.filter((p) => pathKey(p) !== k);
  state.viewed.push(normPath(abs));
  if (state.viewed.length > LIMITS.viewed) state.viewed = state.viewed.slice(-LIMITS.viewed);
}
export function addPending(state, text) {
  const t = String(text).slice(0, 1200);
  state.pending = state.pending.filter((p) => p.text !== t);
  state.pending.push({ ts: Date.now(), text: t });
  if (state.pending.length > LIMITS.pending) state.pending = state.pending.slice(-LIMITS.pending);
}
export function addCommand(state, entry) {
  state.commands.push(entry);
  if (state.commands.length > LIMITS.commands) state.commands = state.commands.slice(-LIMITS.commands);
}

// Record a check outcome. `ts` = when the check started (conservative for background runs).
export function applyOutcome(state, kind, exit, ts) {
  if (!isCheckKind(kind) || exit === null || exit === undefined) return;
  if (exit === 0) {
    if (state.lastVerifyFailTs && state.lastVerifyFailTs < ts) state.sawFailThenPass = true;
    state.lastVerifyPassTs = Math.max(state.lastVerifyPassTs || 0, ts);
  } else {
    if ((state.lastVerifyPassTs || 0) > ts) state.sawFailThenPass = true; // fail resolved late; a pass followed it
    state.lastVerifyFailTs = Math.max(state.lastVerifyFailTs || 0, ts);
  }
}

// Code files edited after the last passing check, newest first.
export function unverifiedEdits(state) {
  const pass = state.lastVerifyPassTs || 0;
  return Object.entries(state.edits)
    .filter(([, e]) => e.code && e.lastTs > pass)
    .sort((a, b) => b[1].lastTs - a[1].lastTs)
    .map(([p]) => p);
}

// ---------------------------------------------------------------- last-verify.json (written by verify.mjs)
export function readLastVerify(ctx) {
  const j = readJson(path.join(ctx.stateDir, "last-verify.json"));
  if (!j || typeof j !== "object" || typeof j.ts !== "number" || typeof j.ok !== "boolean") return null;
  return { ts: j.ts, ok: j.ok, args: Array.isArray(j.args) ? j.args.filter((a) => typeof a === "string") : [] };
}
// A full verify run (no --quick / --only / --changed): the only kind that satisfies the orchestrator's VERIFY phase.
const PARTIAL_VERIFY = /^--(?:quick|only|changed)(?:=|$)/i;
export const isFullVerifyArgs = (args) => !(Array.isArray(args) ? args : []).some((a) => PARTIAL_VERIFY.test(a));
// Merge a verify result that may have finished outside PostToolUse (backgrounded run_command).
export function mergeLastVerify(state, lv) {
  if (!lv || lv.ts < (state.createdAt || 0) - 1000) return;
  if (lv.ok) {
    if (lv.ts > (state.lastVerifyPassTs || 0)) applyOutcome(state, "verify", 0, lv.ts);
  } else if (lv.ts > (state.lastVerifyPassTs || 0) && lv.ts > (state.lastVerifyFailTs || 0)) {
    applyOutcome(state, "verify", 1, lv.ts);
  }
}

// ---------------------------------------------------------------- classifiers
const CODE_EXT = new Set(
  "ts tsx js jsx mjs cjs mts cts vue svelte astro rs go py php java kt kts scala cs fs c h cc cpp hpp swift dart rb ex exs hs zig lua sql sh ps1 css scss sass less html".split(" "),
);
const MANIFESTS = [
  /^package\.json$/, /^tsconfig.*\.json$/, /^cargo\.toml$/, /^go\.mod$/, /^pyproject\.toml$/, /^composer\.json$/,
  /^gemfile$/, /^pom\.xml$/, /^build\.gradle.*$/, /\.csproj$/, /^pubspec\.yaml$/, /^mix\.exs$/,
];
const NON_CODE_PREFIXES = [".agents/memory/", ".agents/rules/", ".agents/guides/", ".agents/docs/", "docs/", ".agents/.state/", ".scratch/"];
const LOCKFILES = new Set([
  "bun.lock", "bun.lockb", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "cargo.lock",
  "go.sum", "composer.lock", "gemfile.lock", "poetry.lock", "uv.lock", "pipfile.lock", "pubspec.lock", "mix.lock",
]);

export function isCodeFile(abs, root) {
  if (!isInside(abs, root)) return false;
  const rel = relPath(abs, root).toLowerCase();
  if (NON_CODE_PREFIXES.some((p) => rel.startsWith(p))) return false;
  if (/(^|\/)(node_modules|\.git)\//.test(rel)) return false;
  const base = rel.split("/").pop();
  if (MANIFESTS.some((re) => re.test(base))) return true;
  const dot = base.lastIndexOf(".");
  return dot > 0 && CODE_EXT.has(base.slice(dot + 1));
}
export const isLockfile = (abs) => LOCKFILES.has(path.posix.basename(normPath(abs)).toLowerCase());
export const isEnvFile = (abs) => /^\.env(rc|\..+)?$/i.test(path.posix.basename(normPath(abs)));

const QUOTED = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
const SHELL_C = /((?:^|\s)(?:-c|\/c|-command)\s+)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/gi;
const PM = "(?:npm|pnpm|yarn|bun)";
const INSTALL_RE = /\b(?:npm|pnpm|yarn|bun|pip3?|uv|poetry|cargo|go|composer|gem|bundle|dotnet)\s+(?:install|add|i|ci|remove|rm|uninstall|update|upgrade|get|init|create)\b/;
// A segment that RUNS verify.mjs (node/bun/deno <path>/verify.mjs, <pm> run verify); a path merely mentioned
// (Test-Path, Select-String, an editor) is not a verify run.
const VERIFY_RUN = new RegExp(`^(?:(?:node|bun|deno)(?:\\.exe)?\\s+(?:\\S+\\s+)*?\\S*\\bverify\\.mjs\\b|${PM}\\s+(?:run\\s+)?verify\\b)`);
const KIND_RULES = [
  ["verify", [VERIFY_RUN]],
  ["test", [
    new RegExp(`\\b${PM}\\s+(?:run\\s+)?test(?::[\\w:-]+)?\\b`), /\b(?:vitest|jest|mocha)\b/, /\bplaywright\s+test\b/,
    /\bcargo\s+(?:\+\S+\s+)?(?:test|nextest)\b/, /\bgo\s+test\b/, /\bpytest\b/, /\bpython[\d.]*\s+-m\s+unittest\b/, /\b(?:pest|phpunit)\b/,
    /\bartisan\s+test\b/, /\bdotnet\s+test\b/, /\brspec\b/, /\bmix\s+test\b/, /\b(?:flutter|dart|swift|deno)\s+test\b/,
    /\bnode\s+(?:--[\w-]+(?:=\S+)?\s+)*--test\b/, /\bctest\b/, /\bmvnw?(?:\.cmd)?\s+.*\b(?:test|verify)\b/,
    /\bgradlew?(?:\.bat)?\s+.*\b(?:test|check)\b/, /\brails\s+test\b/, /\b(?:tox|nox)\b/,
  ]],
  ["lint", [
    new RegExp(`\\b${PM}\\s+(?:run\\s+)?(?:lint|typecheck|type-check|check-types|check|format:check)(?::[\\w:-]+)?\\b`),
    /\beslint\b/, /\bbiome\s+(?:check|lint|ci)\b/, /\bruff\b/, /\bmypy\b/, /\bpyright\b/, /\bphpstan\b/, /\bpint\b/,
    /\brubocop\b/, /\bcargo\s+(?:clippy|check|fmt)\b/, /\bgo\s+vet\b/, /\bgolangci-lint\b/, /\bgofmt\b/,
    /\b(?:dart|flutter)\s+analyze\b/, /\b(?:vue-)?tsc\b/, /\bsvelte-check\b/, /\bastro\s+check\b/, /\bprettier\b.*--check\b/,
    /\bmix\s+(?:format|credo)\b/, /\bmix\s+compile\s+--warnings-as-errors\b/, /\bshellcheck\b/, /\bclang-tidy\b/, /\bktlint\b/,
  ]],
  ["build", [
    new RegExp(`\\b${PM}\\s+(?:run\\s+)?build(?::[\\w:-]+)?\\b`), /\bvite\s+build\b/, /\bnext\s+build\b/,
    /\b(?:cargo|go|dotnet|swift|zig)\s+build\b/, /\bmvnw?\b/, /\bgradlew?\b/, /\bcmake\s+--build\b/, /\bmix\s+compile\b/, /\bmake\b/,
  ]],
];

// Commands that change files. The orchestrator never runs them itself (they are worker tasks); see isWriteCommand.
const WRITE_RULES = [
  /^(?:set-content|out-file|add-content|new-item|remove-item|move-item|copy-item|rename-item|clear-content|tee-object)\b/,
  /^(?:sudo\s+)?(?:rm|mv|cp|del|erase|rmdir|rd|mkdir|md|touch|ren|rename|tee|copy|move|xcopy|robocopy|ln|mklink|truncate)(?:\.exe)?(?:\s|$)/,
  /^sed\b.*\s(?:-[a-z]*i|--in-place\b)/, /^perl\b.*\s-[plnae0]*i/, // in-place edits
  /^(?:sc|ac|ni|ri|mi|cpi)\s+\S/, // PowerShell aliases of the cmdlets above
  INSTALL_RE,
  /\b(?:biome|prettier)\b.*\s--write\b/, /\beslint\b.*\s--fix\b/, new RegExp(`\\b${PM}\\s+(?:run\\s+)?format(?![:\\w-])`),
  /\blessons\.mjs\s+(?:add|vote|retire|promote)(?![\w-])/, /\bskill-draft\.mjs\s+new\b/,
  /\bgit\s+(?:-c\s+\S+\s+)*(?:add|commit|init)\b/,
  // git commands that rewrite working-tree files
  /\bgit\s+(?:-c\s+\S+\s+)*(?:checkout|restore|switch|stash(?!\s+(?:list|show)\b)|apply|rm|mv|clean|reset\s+(?:\S+\s+)*?--hard|merge|rebase|pull|cherry-pick|revert|am)\b/,
];
const WRITE_SCRIPTS = /\b(?:activate-stack|kit-install)\.mjs\b/; // write unless --dry-run
// Output redirection to a file (not 2>&1, >$null, >nul, >/dev/null).
const REDIRECT = /(?:^|[^=\-<>])\d?>>?(?!\s*(?:&\d|\$null\b|nul\b|\/dev\/null\b))\s*[^\s&|;]/;

// "powershell -NoProfile -Command <inner>" / "cmd /d /c <inner>" / "bash -c <inner>": the anchored rules see <inner>.
const WRAPPER = /^(?:powershell|pwsh|cmd|bash|sh|zsh)(?:\.exe)?\s+(?:[-/][\w-]+\s+)*?(?:-c|\/c|\/k|-command)\s+/;
function shellSegments(cmd, keepShortQuoted) {
  const s = cmd
    .replace(SHELL_C, (_m, pre, q) => pre + q.slice(1, -1)) // cmd /c "...", bash -c '...', pwsh -Command "..."
    .replace(QUOTED, (m) => (keepShortQuoted && !/\s/.test(m.slice(1, -1)) ? " " + m.slice(1, -1) + " " : " _ "))
    .toLowerCase();
  return s.split(/&&|\|\||[;|\n]|&(?!\d|>)/).map((x) => x.trim().replace(/^&\s*/, "").replace(WRAPPER, "").trim()).filter(Boolean);
}
// true when a command line RUNS a full verify.mjs (VERIFY_RUN, no --quick / --only / --changed).
export function isFullVerifyCommand(cmd) {
  if (typeof cmd !== "string") return false;
  return shellSegments(cmd, true).some((seg) => VERIFY_RUN.test(seg) && isFullVerifyArgs(seg.split(/\s+/)));
}

// true when a run_command line writes files (quoted text is data and ignored).
export function isWriteCommand(cmd) {
  if (typeof cmd !== "string" || !cmd.trim()) return false;
  for (const seg of shellSegments(cmd, false)) {
    if (/^(?:echo|write-output|write-host)\b/.test(seg) && !REDIRECT.test(seg)) continue;
    if (WRITE_RULES.some((re) => re.test(seg)) || REDIRECT.test(seg)) return true;
    if (WRITE_SCRIPTS.test(seg) && !/\s(?:--dry-run|-n)\b/.test(seg)) return true;
  }
  return false;
}
export const isCheckKind = (k) => k === "verify" || k === "test" || k === "lint" || k === "build";

// kind of a run_command: verify | test | lint | build (checks) | write (changes files, no check) | other.
// Quoted text with spaces (commit messages, echo) is ignored.
export function classifyCommand(cmd) {
  if (typeof cmd !== "string" || !cmd.trim()) return "other";
  let best = "other";
  const rank = { verify: 4, test: 3, lint: 2, build: 1, other: 0 };
  for (const seg of shellSegments(cmd, true)) {
    if (INSTALL_RE.test(seg) || /^\s*(?:echo|write-output|write-host|git|cat|type|get-content)\b/.test(seg)) continue;
    for (const [kind, res] of KIND_RULES) {
      if (rank[kind] > rank[best] && res.some((re) => re.test(seg))) best = kind;
    }
  }
  return best === "other" && isWriteCommand(cmd) ? "write" : best;
}

// Mask obvious secrets before storing a command line.
export function redact(cmd) {
  return String(cmd)
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 ***")
    .replace(/((?:token|password|passwd|pwd|secret|api[_-]?key|auth|authorization)["']?\s*[=:]\s*["']?)[^\s"'&]+/gi, "$1***")
    .replace(/(\/\/[^/\s:@]+:)[^@\s/]+@/g, "$1***@");
}

// ---------------------------------------------------------------- transcript parsing
export function unwrapArg(v) {
  if (typeof v === "string" && v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') {
    try { const u = JSON.parse(v); if (typeof u === "string") return u; } catch { /* keep */ }
  }
  return v;
}

export function readTail(file, maxBytes = 256 * 1024) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    let text = buf.toString("utf8");
    if (start > 0) {
      const i = text.indexOf("\n");
      text = i >= 0 ? text.slice(i + 1) : "";
    }
    return text;
  } catch { return ""; } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

export function parseSteps(text) {
  const steps = [];
  for (const line of String(text).split("\n")) {
    const t = line.trim();
    if (!t || t[0] !== "{") continue;
    try {
      const o = JSON.parse(t);
      if (o && typeof o === "object") steps.push(o);
    } catch { /* partial or corrupt line */ }
  }
  return steps;
}

// Transcript files to consult: the payload path first, then its sibling (transcript.jsonl <-> transcript_full.jsonl).
export function transcriptFiles(tp) {
  const p = expandHome(tp);
  if (!p) return [];
  const dir = path.dirname(p);
  const base = path.basename(p);
  const out = [p];
  if (base === "transcript.jsonl") out.push(path.join(dir, "transcript_full.jsonl"));
  else if (base === "transcript_full.jsonl") out.push(path.join(dir, "transcript.jsonl"));
  return out.filter((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } });
}

// Lazily loaded list of step arrays (one per transcript file), cached on ctx.
export function getTranscripts(ctx) {
  if (ctx.transcript === undefined) {
    ctx.transcript = transcriptFiles(ctx.payload.transcriptPath).map((f) => parseSteps(readTail(f)));
  }
  return ctx.transcript;
}

// Exit code from a tool-result step. Only the header before "Output:" is inspected, so tool output cannot spoof it.
// Phrasings seen in real transcripts: CLI "The command exited with code N." ; 2.0 app "The command completed
// successfully." / "The command failed with exit code: N" ; background completion "Task id "X" finished with result:".
export function exitFromContent(content) {
  if (typeof content !== "string" || !content) return null;
  const anchor = content.indexOf("finished with result:");
  let head = content.slice(Math.max(0, anchor), Math.max(0, anchor) + 700);
  const out = head.indexOf("Output:");
  if (out >= 0) head = head.slice(0, out);
  const m = /exited with (?:exit )?code:?\s*(-?\d+)/i.exec(head) || /failed with exit code:?\s*(-?\d+)/i.exec(head);
  if (m) return Number(m[1]);
  if (/The command completed successfully/i.test(head)) return 0;
  return null;
}
export function exitFromError(err) {
  const m = /exit(?:ed with)? (?:status|code):?\s*(-?\d+)/i.exec(String(err || ""));
  return m ? Number(m[1]) : null;
}
export function bgTaskId(content) {
  const m = /running as a background task with task id:\s*(\S+)/i.exec(String(content || "").slice(0, 600));
  return m ? m[1] : null;
}

const normCmd = (c) => String(unwrapArg(c) ?? "").trim().replace(/\s+/g, " ");
function analyzeStep(r) {
  if (!r || typeof r.content !== "string") return { exit: null, taskId: null };
  return { exit: exitFromContent(r.content), taskId: bgTaskId(r.content) };
}
function indexSteps(steps) {
  const m = new Map();
  for (const s of steps) if (Number.isInteger(s.step_index)) m.set(s.step_index, s);
  return m;
}

// Locate the result of `cmdLine`: the newest planner step that issued it -> result step P+1+j.
export function findCommandResult(ctx, cmdLine, stepIdx) {
  const want = normCmd(cmdLine);
  let best = { exit: null, taskId: null, resIdx: null };
  for (const steps of getTranscripts(ctx)) {
    const byIdx = indexSteps(steps);
    let hit = null;
    outer: for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      const tcs = Array.isArray(s.tool_calls) ? s.tool_calls : [];
      for (let j = tcs.length - 1; j >= 0; j--) {
        const tc = tcs[j];
        if (!tc || tc.name !== "run_command" || !tc.args || normCmd(tc.args.CommandLine) !== want) continue;
        if (!Number.isInteger(s.step_index)) continue;
        const resIdx = s.step_index + 1 + j;
        if (Number.isInteger(stepIdx) && resIdx < stepIdx - 2) break outer; // stale: an older run of the same command
        hit = { resIdx, ...analyzeStep(byIdx.get(resIdx)) };
        break outer;
      }
    }
    if (!hit && Number.isInteger(stepIdx)) {
      for (const k of [stepIdx, stepIdx + 1]) {
        const a = analyzeStep(byIdx.get(k));
        if (a.exit !== null || a.taskId) { hit = { resIdx: k, ...a }; break; }
      }
    }
    if (hit) {
      if (hit.exit !== null || hit.taskId) return hit;
      if (best.resIdx === null) best = hit;
    }
  }
  return best;
}

// Background task completions: Map taskId -> exit code.
export function taskResults(ctx) {
  const map = new Map();
  for (const steps of getTranscripts(ctx)) {
    for (const s of steps) {
      const c = typeof s.content === "string" ? s.content : "";
      if (!c.includes("finished with result:")) continue;
      const re = /Task id "([^"]+)" finished with result:/g;
      let m;
      while ((m = re.exec(c))) {
        const exit = exitFromContent(c.slice(m.index));
        if (exit !== null && !map.has(m[1])) map.set(m[1], exit);
      }
    }
  }
  return map;
}

// Resolve check commands whose exit code was unknown at PostToolUse time (not flushed yet / backgrounded).
export function resolvePending(state, ctx) {
  const open = state.commands.filter((c) => isCheckKind(c.kind) && (c.exit === null || c.exit === undefined) && (c.taskId || Number.isInteger(c.resIdx)));
  if (!open.length) return 0;
  const tasks = taskResults(ctx);
  const byIdxList = getTranscripts(ctx).map(indexSteps);
  let n = 0;
  for (const c of open) {
    let exit = null;
    if (c.taskId && tasks.has(c.taskId)) exit = tasks.get(c.taskId);
    if (exit === null && Number.isInteger(c.resIdx)) {
      for (const byIdx of byIdxList) {
        const a = analyzeStep(byIdx.get(c.resIdx));
        if (a.exit !== null) { exit = a.exit; break; }
        if (a.taskId && !c.taskId) c.taskId = a.taskId;
      }
      if (exit === null && c.taskId && tasks.has(c.taskId)) exit = tasks.get(c.taskId);
    }
    if (exit !== null) {
      c.exit = exit;
      delete c.resIdx;
      applyOutcome(state, c.kind, exit, c.ts);
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------- orchestrator mode (.agents/docs/architecture.md)
export const PHASES = ["EXPLORE", "PREPARE", "IMPLEMENT", "REVIEW", "FIX", "TEST", "LEARN"];
const TYPE_PHASE = {
  explorer: "EXPLORE", "docs-researcher": "EXPLORE", "git-historian": "EXPLORE", planner: "PREPARE",
  implementer: "IMPLEMENT", reviewer: "REVIEW", "security-auditor": "REVIEW", fixer: "FIX", debugger: "FIX",
  "test-engineer": "TEST", "e2e-tester": "TEST", scribe: "LEARN", advisor: "CONSULT",
};
// TypeName -> phase; self, research, browser and unknown names -> OTHER.
export const phaseOf = (type) => TYPE_PHASE[String(type || "").trim().toLowerCase()] || "OTHER";
export const WORKER_TYPES = Object.keys(TYPE_PHASE); // fallback roster when .agents/agents/ cannot be read
export const WRITER_TYPES = new Set(["implementer", "fixer", "debugger", "test-engineer", "e2e-tester", "scribe"]);
const PHASE_SET = new Set([...PHASES, "CONSULT"]);
// Phase of one dispatch: the brief's "PHASE: <X>" when X is a real phase this type may run (debugger in EXPLORE,
// test-engineer writing characterization tests), else the TypeName map. Types limited to some phases stay there
// (implementer/fixer: IMPLEMENT/FIX; debugger: EXPLORE/FIX; advisor: CONSULT) and a gate phase counts only for its
// owners (TEST: test-engineer/e2e-tester, REVIEW: reviewer/security-auditor, LEARN: scribe), so a mislabelled
// brief can neither switch the PIPELINE GATE off nor satisfy it.
const TYPE_PHASES = { implementer: ["IMPLEMENT", "FIX"], fixer: ["IMPLEMENT", "FIX"], debugger: ["EXPLORE", "FIX"], advisor: ["CONSULT"] };
const PHASE_OWNERS = {
  TEST: ["test-engineer", "e2e-tester"], REVIEW: ["reviewer", "security-auditor"], LEARN: ["scribe"], CONSULT: ["advisor"],
};
export function dispatchPhase(type, prompt) {
  const byType = phaseOf(type);
  const m = /\bPHASE:\s*([A-Za-z]+)/.exec(String(prompt || ""));
  const brief = m ? m[1].toUpperCase() : "";
  if (!PHASE_SET.has(brief)) return byType;
  const t = String(type || "").trim().toLowerCase();
  if (TYPE_PHASES[t] && !TYPE_PHASES[t].includes(brief)) return byType;
  if (PHASE_OWNERS[brief] && !PHASE_OWNERS[brief].includes(t)) return byType;
  return brief;
}
// First task id of a brief ("TASK: T3 | ..."), or "".
export const taskOf = (prompt) => { const m = /\bTASK:\s*(T\d+[a-z]?)\b/.exec(String(prompt || "")); return m ? m[1] : ""; };
// Worker Report status line "## <AGENT>: <PASS|FAIL|BLOCKED>" -> status, or null.
export function reportStatus(text) {
  const m = /##\s*[A-Za-z][\w-]*(?:\s[\w-]+)?\s*:\s*(PASS|FAIL|BLOCKED)\b/.exec(String(text || ""));
  return m ? m[1] : null;
}
const STALE_DISPATCH_MS = 6 * 60 * 60 * 1000; // an unlinked dispatch older than this no longer counts as "waiting"

export function readHead(file, maxBytes = 16 * 1024) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(Math.min(maxBytes, fs.fstatSync(fd).size));
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).toString("utf8");
  } catch { return ""; } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

// A dispatch brief (.agents/docs/architecture.md, pipeline) or a worker system prompt in step 0 marks a WORKER even without "sender="
// (IDE subagent before its parent links it, Workspace "branch" child): "TASK: T<n>" + "AGENT:", or "TASK: T<n>" +
// "OBJECTIVE:" + "OWNED FILES:" (what orchestrator-guard requires, so every brief it allows marks a worker).
const briefMarked = (s) => (/\bTASK:\s*T\d/.test(s) && (/\bAGENT:/.test(s) || (/\bOBJECTIVE:/.test(s) && /\bOWNED FILES:/.test(s))))
  || s.includes("You are a WORKER");

// Step 0 of the transcript head: { type, worker } or null when no step 0 is readable. worker = step 0 is a
// SYSTEM_MESSAGE containing "sender=" (a message from another agent started this conversation) or carries the
// brief markers "TASK: T<n>" + "AGENT:" / "You are a WORKER".
export function headInfo(text) {
  const lines = String(text || "").split("\n").slice(0, 5);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t[0] !== "{") continue;
    let o = null;
    try { o = JSON.parse(t); } catch { /* a long first line may be cut at the 16 KB head: inspect its raw prefix */ }
    if (o && typeof o === "object") {
      if (o.step_index !== 0) continue;
      const c = typeof o.content === "string" ? o.content : "";
      const type = typeof o.type === "string" ? o.type : "";
      return { type, worker: (type === "SYSTEM_MESSAGE" && c.includes("sender=")) || briefMarked(c) };
    }
    if (/"step_index"\s*:\s*0\s*[,}]/.test(t)) {
      const m = /"type"\s*:\s*"([A-Z_]+)"/.exec(t); // the real key precedes "content"; escaped look-alikes never match
      const type = m ? m[1] : "";
      return { type, worker: (type === "SYSTEM_MESSAGE" && t.includes("sender=")) || briefMarked(t) };
    }
  }
  return null;
}
// Role from the first transcript line(s): worker (see headInfo); any other step 0 -> orchestrator; unreadable -> null.
export function roleFromHead(text) {
  const h = headInfo(text);
  return h ? (h.worker ? "worker" : "orchestrator") : null;
}

// Parent link, independent of the transcript head: when a parent links a child id (linkChildren) it writes
// <state>/children/<childId>.json. Needed because an IDE subagent's step 0 is a USER_INPUT (the brief) with no
// "sender=" marker. Works when parent and child share the workspace (Workspace "inherit"), the default.
export const childMarkerPath = (ctx, id) => path.join(ctx.stateDir, "children", `${safeId(id)}.json`);
export const hasParentMarker = (ctx) => { try { return fs.existsSync(childMarkerPath(ctx, ctx.convId)); } catch { return false; } };
const MARKERS_MAX = 300;
function writeChildMarker(ctx, id, parent, type) {
  try {
    const dir = path.join(ctx.stateDir, "children");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(childMarkerPath(ctx, id), JSON.stringify({ parent, type, ts: Date.now() }));
    const names = fs.readdirSync(dir).filter((n) => n.endsWith(".json"));
    if (names.length > MARKERS_MAX) {
      names.map((n) => { try { return [n, fs.statSync(path.join(dir, n)).mtimeMs]; } catch { return [n, 0]; } })
        .sort((a, b) => a[1] - b[1]).slice(0, names.length - 200)
        .forEach(([n]) => { try { fs.unlinkSync(path.join(dir, n)); } catch { /* ignore */ } });
    }
  } catch { /* the transcript-head check still works for CLI workers */ }
}

export function detectRole(ctx) {
  if (hasParentMarker(ctx)) return "worker";
  for (const f of transcriptFiles(ctx.payload.transcriptPath)) {
    const r = roleFromHead(readHead(f));
    if (r) return r;
  }
  return null;
}

export const WORKER_CARD = "[worker] You are a WORKER: do only the one task in your brief, edit only OWNED FILES, verify, then report once with send_message (Worker Report envelope). Never delegate.";
export const ROLE_CORRECTION = "[worker] Role correction: another agent dispatched this conversation, so ignore the earlier ORCHESTRATOR card and [orchestrator] notes. " + WORKER_CARD.slice("[worker] ".length);

// Cached per conversation once known; retried on every hook call while still null. An "orchestrator" that has
// not dispatched anything is re-checked for a parent marker on every call (race: the child's first hook can run
// before the parent's PostToolUse links it); on upgrade, orchestrator-only notes are dropped and the worker card
// is queued for the next invocation.
export function ensureRole(state, ctx) {
  if (!state.role) state.role = detectRole(ctx);
  else if (state.role === "orchestrator" && !state.dispatches.length && hasParentMarker(ctx)) {
    state.role = "worker";
    state.pending = state.pending.filter((p) => !p.text.startsWith("[orchestrator]"));
    state.orchestratorEditWarned = [];
    addPending(state, ROLE_CORRECTION);
  }
  return state.role;
}

const typeNameOf = (sa) => String(unwrapArg(sa && sa.TypeName) ?? "").trim().slice(0, 60) || "unknown";
export function subagentList(v) {
  let subs = unwrapArg(v);
  if (typeof subs === "string") { try { subs = JSON.parse(subs); } catch { subs = []; } }
  return Array.isArray(subs) ? subs : [];
}

export function recordDispatches(state, subagents, now, step) {
  let n = 0;
  for (const sa of Array.isArray(subagents) ? subagents : []) {
    if (!sa || typeof sa !== "object") continue;
    const type = typeNameOf(sa);
    const role = String(unwrapArg(sa.Role) ?? "").trim().slice(0, 80);
    const prompt = String(unwrapArg(sa.Prompt) ?? "");
    state.dispatches.push({
      ts: now, type, phase: dispatchPhase(type, prompt), step: Number.isInteger(step) ? step : null, child: null, role, task: taskOf(prompt),
    });
    n++;
  }
  if (state.dispatches.length > LIMITS.dispatches) state.dispatches = state.dispatches.slice(-LIMITS.dispatches);
  return n;
}

const CREATED = "Created the following subagents:";
const CONV_ID = /\\?"conversationId\\?"\s*:\s*\\?"([A-Za-z0-9_.:/-]+)/g;
// TypeNames of the invoke_subagent call whose result is step `idx` (result of call j of planner step P is at
// P + 1 + j, the same rule findCommandResult uses), lower-cased; null when the call is not in the transcript.
function callTypes(byIdx, idx) {
  for (let j = 0; j < 12; j++) {
    const s = byIdx.get(idx - 1 - j);
    if (!s || !Array.isArray(s.tool_calls)) continue; // an earlier sibling's result step (or missing): keep looking
    const tc = s.tool_calls[j];
    if (!tc || tc.name !== "invoke_subagent" || !tc.args) return null;
    return subagentList(tc.args.Subagents).filter((x) => x && typeof x === "object").map((x) => typeNameOf(x).toLowerCase());
  }
  return null;
}

// Tool-result steps that announce new children, oldest first: [{ idx, ids[], types[]|null }].
export function createdSteps(ctx) {
  const out = [];
  const seen = new Set();
  for (const steps of getTranscripts(ctx)) {
    let byIdx = null;
    for (const s of steps) {
      const c = typeof s.content === "string" ? s.content : "";
      const at = c.indexOf(CREATED);
      if (at < 0) continue;
      const ids = [];
      for (const m of c.slice(at).matchAll(CONV_ID)) if (!ids.includes(m[1])) ids.push(m[1]);
      const key = ids.join(",");
      if (!ids.length || seen.has(key)) continue; // the same step can appear in both transcript files
      seen.add(key);
      const idx = Number.isInteger(s.step_index) ? s.step_index : -1;
      if (!byIdx) byIdx = indexSteps(steps);
      out.push({ idx, ids, types: idx >= 0 ? callTypes(byIdx, idx) : null });
    }
  }
  return out.sort((a, b) => a.idx - b.idx);
}

// Map unlinked dispatches to child conversation ids. Batches (one invoke_subagent call) are matched newest
// first to the newest unused "Created the following subagents:" step at or after the batch's step, so a batch
// whose result never appeared cannot steal a later batch's children. When the issuing call is visible in the
// transcript, its TypeNames must equal the batch's (two parallel calls in one planner step never swap children).
// Ids map to the batch entries in order. Each linked child gets a parent marker (see hasParentMarker).
export function linkChildren(state, ctx) {
  const open = state.dispatches.filter((d) => !d.child);
  if (!open.length) return 0;
  const batches = [];
  for (const d of open) {
    const last = batches[batches.length - 1];
    if (last && last.ts === d.ts && last.step === d.step) last.items.push(d);
    else batches.push({ ts: d.ts, step: d.step, items: [d] });
  }
  const known = new Set(Object.keys(state.children));
  const created = createdSteps(ctx).map((c) => ({ ...c, ids: c.ids.filter((id) => !known.has(id)) })).filter((c) => c.ids.length);
  let n = 0;
  for (const b of batches.reverse()) {
    const lower = b.step === null ? -Infinity : b.step - 2;
    const sig = b.items.map((d) => d.type.toLowerCase()).join("\n");
    let pick = -1;
    for (let i = created.length - 1; i >= 0; i--) {
      const c = created[i];
      if (!c.used && c.idx >= lower && (!c.types || c.types.join("\n") === sig)) { pick = i; break; }
    }
    if (pick < 0) continue;
    const c = created[pick];
    c.used = true;
    b.items.forEach((d, i) => {
      if (i >= c.ids.length) return;
      d.child = c.ids[i];
      state.children[d.child] = { type: d.type, role: d.role || "", phase: d.phase, task: d.task || "", dispatchedTs: d.ts, repliedTs: null, status: null };
      writeChildMarker(ctx, d.child, state.conversationId, d.type);
      n++;
    });
  }
  const ids = Object.keys(state.children);
  if (ids.length > LIMITS.dispatches) {
    ids.sort((x, y) => state.children[x].dispatchedTs - state.children[y].dispatchedTs)
      .slice(0, ids.length - LIMITS.dispatches).forEach((k) => delete state.children[k]);
  }
  return n;
}

// A child's result reaches the parent as a SYSTEM_MESSAGE step: its send_message ("sender=<childId>"), or,
// when it ends without send_message (IDE), the system notice "sender=system ... Subagent <childId> has gone
// idle. This was the subagent's most recent response: ...". Both count as the reply.
const REPLY_RES = [/\bsender=([A-Za-z0-9_.:/-]+)/g, /\bSubagent ([A-Za-z0-9_.:-]+) has gone idle\b/g];
export function scanReplies(state, ctx) {
  const ids = new Set(Object.keys(state.children));
  if (!ids.size) return 0;
  const now = Date.now();
  let n = 0;
  const lastStatus = new Map(); // child id -> status of its newest visible reply (transcript order is chronological)
  for (const steps of getTranscripts(ctx)) {
    for (const s of steps) {
      if (s.type !== "SYSTEM_MESSAGE" || typeof s.content !== "string") continue;
      if (!s.content.includes("sender=") && !s.content.includes("has gone idle")) continue;
      const at = Date.parse(s.created_at);
      for (const m of REPLY_RES.flatMap((re) => [...s.content.matchAll(re)])) {
        const id = m[1].replace(/[.:]+$/, "");
        const c = ids.has(id) ? state.children[id] : null;
        if (!c) continue;
        // Only a message carrying a Worker Report envelope ("## <AGENT>: <STATUS>") sets the status and moves
        // repliedTs. A plain follow-up ("Task T3 is complete...", seen live after a report) must never clobber an
        // earlier PASS; it only ends the wait when no report has arrived yet.
        const st = reportStatus(s.content.slice(m.index));
        if (st !== null) lastStatus.set(id, st);
        // created_at only when it is plausible on our clock (after the dispatch, not in the future);
        // otherwise (missing, other clock / time zone) the time we first saw the reply.
        const ts = Number.isFinite(at) && at >= c.dispatchedTs - 2000 && at <= now + 5000 ? at : now;
        if (c.repliedTs === null) { c.repliedTs = ts; n++; } else if (st !== null && ts > c.repliedTs && Number.isFinite(at) && ts === at) { c.repliedTs = ts; n++; }
      }
    }
  }
  // Only a "## <AGENT>: PASS" report counts toward the PIPELINE GATE; FAIL / BLOCKED / no envelope do not.
  for (const [id, st] of lastStatus) state.children[id].status = st;
  return n;
}

// Labels of the workers still expected to report, e.g. ["implementer T1", "reviewer T2"].
export function waitingList(state, now = Date.now()) {
  const label = (type, task) => `${type}${task ? ` ${task}` : ""}`;
  const out = [];
  for (const c of Object.values(state.children)) if (c.repliedTs === null) out.push(label(c.type, c.task));
  for (const d of state.dispatches) if (unlinkedWaiting(state, d, now)) out.push(label(d.type, d.task));
  return out;
}

// Content of the newest model response (PLANNER_RESPONSE) in the transcript tail, or "".
export function latestModelText(ctx) {
  let best = null;
  for (const steps of getTranscripts(ctx)) {
    for (const s of steps) {
      if (s.type !== "PLANNER_RESPONSE" || typeof s.content !== "string") continue;
      const i = Number.isInteger(s.step_index) ? s.step_index : -1;
      if (!best || i >= best.i) best = { i, text: s.content };
    }
  }
  return best ? best.text : "";
}
// A Completion Report heading/line ("## Completion Report", "**Completion Report**", "Completion Report:").
export const hasCompletionReport = (text) => /(?:^|\n)[ \t>*#_-]*Completion Report\b/i.test(String(text || ""));

// An unlinked dispatch still counts as waiting only while its "Created ..." result may yet appear: it is recent
// and no LATER dispatch has been linked (results are written in order, so a linked later batch proves this
// one's result is missing, e.g. the call failed without an error or the step fell out of the transcript tail),
// and no sibling of the same batch was linked (the call created fewer children than requested, e.g. quota).
function unlinkedWaiting(state, d, now) {
  return !d.child && now - d.ts < STALE_DISPATCH_MS
    && !state.dispatches.some((x) => x.child && (x.ts > d.ts || (x.ts === d.ts && x.step === d.step)));
}

// Workers still expected to report: linked children without a reply + unlinked dispatches that may still link.
export function waitingCount(state, now = Date.now()) {
  let n = 0;
  for (const c of Object.values(state.children)) if (c.repliedTs === null) n++;
  for (const d of state.dispatches) if (unlinkedWaiting(state, d, now)) n++;
  return n;
}

// "[orchestrator] Phases: EXPLORE ✓ PREPARE … IMPLEMENT – ... | waiting on: n worker(s)"
export function phaseLedger(state, now = Date.now()) {
  const marks = PHASES.map((p) => {
    const ds = state.dispatches.filter((d) => d.phase === p);
    if (!ds.length) return `${p} –`;
    const waiting = ds.some((d) => (d.child ? state.children[d.child] && state.children[d.child].repliedTs === null : unlinkedWaiting(state, d, now)));
    const done = ds.some((d) => d.child && state.children[d.child] && state.children[d.child].repliedTs !== null);
    return `${p} ${!waiting && done ? "✓" : "…"}`;
  });
  return `[orchestrator] Phases: ${marks.join(" ")} | waiting on: ${waitingCount(state, now)} worker(s)`;
}

// Pipeline completeness after the last IMPLEMENT/FIX work (quality-gate's PIPELINE GATE).
// Returns { applies, waiting, key, missing[] } where missing ⊆ ["REVIEW","TEST","VERIFY","LEARN"]:
//  REVIEW  a REVIEW dispatch after the latest IMPLEMENT or FIX dispatch (targeted re-review after a fix);
//  TEST    a PASS reply from a TEST worker after W (the latest IMPLEMENT/FIX reply), and no tester type whose
//          newest reply after W is FAIL;
//  VERIFY  a passing full verify.mjs run (no --quick/--only/--changed) after T = the latest TEST reply (or W): a
//          command in this conversation that runs verify.mjs, or last-verify.json ok with full args;
//  LEARN   a PASS reply from the scribe after T.
// Only "## <AGENT>: PASS" reports count; FAIL / BLOCKED / missing envelopes do not.
export function pipelineCheck(state, lv, now = Date.now()) {
  const work = state.dispatches.filter((d) => d.phase === "IMPLEMENT" || d.phase === "FIX");
  if (!work.length) return { applies: false, waiting: 0, key: 0, missing: [] };
  const latestWork = Math.max(...work.map((d) => d.ts));
  let W = 0;
  for (const d of work) {
    const c = d.child ? state.children[d.child] : null;
    W = Math.max(W, c && c.repliedTs !== null ? c.repliedTs : d.ts);
  }
  const replied = (phase) => Object.values(state.children)
    .filter((c) => (c.phase || phaseOf(c.type)) === phase && c.repliedTs !== null);
  const missing = [];
  if (!state.dispatches.some((d) => d.phase === "REVIEW" && d.ts > latestWork)) missing.push("REVIEW");
  const tests = replied("TEST").filter((c) => c.repliedTs >= W);
  const newest = new Map(); // TypeName -> its newest TEST reply after W (a re-run of the same tester supersedes a FAIL)
  for (const c of tests) { const k = c.type.toLowerCase(); if (!newest.has(k) || c.repliedTs >= newest.get(k).repliedTs) newest.set(k, c); }
  if (!tests.some((c) => c.status === "PASS") || [...newest.values()].some((c) => c.status === "FAIL")) missing.push("TEST");
  const T = Math.max(W, ...tests.map((c) => c.repliedTs));
  const verified = (lv && lv.ok && isFullVerifyArgs(lv.args) && lv.ts > T)
    || state.commands.some((c) => c.kind === "verify" && c.exit === 0 && c.ts > T && isFullVerifyCommand(c.cmd));
  if (!verified) missing.push("VERIFY");
  if (!replied("LEARN").some((c) => c.status === "PASS" && c.repliedTs >= T)) missing.push("LEARN");
  return { applies: true, waiting: waitingCount(state, now), key: latestWork, missing };
}

// ---------------------------------------------------------------- external tools (cached where/which lookup)
function lookupTool(name) {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return [];
  const r = IS_WIN
    ? spawnSync("where.exe", [name], { encoding: "utf8", timeout: 3000, windowsHide: true })
    : spawnSync("/bin/sh", ["-c", `command -v ${name}`], { encoding: "utf8", timeout: 3000 });
  if (r.error || r.status !== 0 || !r.stdout) return [];
  return r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    .filter((c) => !IS_WIN || /\.(exe|com|bat|cmd)$/i.test(c));
}

// Spawn an external tool; .bat/.cmd shims (e.g. Herd's php.bat) go through cmd.exe with strict quoting.
export function runTool(tool, args, { timeout = 6000, cwd } = {}) {
  const opts = { encoding: "utf8", timeout, windowsHide: true, maxBuffer: 1024 * 1024, cwd };
  if (IS_WIN && /\.(bat|cmd)$/i.test(tool)) {
    if ([tool, ...args].some((a) => /["%\r\n]/.test(a))) return { error: new Error("unsafe-arg") };
    const line = [tool, ...args].map((a) => `"${a}"`).join(" ");
    return spawnSync("cmd.exe", ["/d", "/s", "/c", `"${line}"`], { ...opts, windowsVerbatimArguments: true });
  }
  return spawnSync(tool, args, opts);
}

// Returns an absolute path or null. Cached per machine in <state>/tool-cache.json for 24 h.
export function findTool(stateDir, name, validate) {
  const file = path.join(stateDir, "tool-cache.json");
  let cache = readJson(file);
  if (!cache || cache.v !== 1 || !cache.tools || typeof cache.tools !== "object") cache = { v: 1, tools: {} };
  const hit = cache.tools[name];
  if (hit && typeof hit.ts === "number" && Date.now() - hit.ts < DAY) {
    if (hit.path === null) return null;
    if (typeof hit.path === "string" && fs.existsSync(hit.path)) return hit.path;
  }
  let found = null;
  for (const c of lookupTool(name)) {
    if (!validate || validate(c)) { found = c; break; }
  }
  cache.tools[name] = { path: found, ts: Date.now() };
  try { writeJsonAtomic(file, cache); } catch { /* cache is optional */ }
  return found;
}

// python that really runs (skips the Microsoft Store stub).
export function findPython(stateDir) {
  const ok = (p) => {
    const r = runTool(p, ["--version"], { timeout: 3000 });
    return !r.error && r.status === 0 && /Python\s+3/.test(`${r.stdout || ""}${r.stderr || ""}`);
  };
  return IS_WIN
    ? findTool(stateDir, "python", ok) || findTool(stateDir, "python3", ok)
    : findTool(stateDir, "python3", ok) || findTool(stateDir, "python", ok);
}

// Nearest directory at or above `root` that contains .git (dir or file), or null.
export function findGitRoot(root) {
  let dir = normPath(root);
  for (let i = 0; i < 8 && dir; i++) {
    try { fs.statSync(path.join(dir, ".git")); return dir; } catch { /* keep walking */ }
    const up = normPath(path.dirname(dir));
    if (!up || up === dir) break;
    dir = up;
  }
  return null;
}

// ---------------------------------------------------------------- debug log (opt-in)
export function errInfo(e) {
  if (!e || typeof e !== "object") return String(e).slice(0, 80);
  const msg = String(e.message || "").replace(/"[^"]*"|'[^']*'/g, '"…"').slice(0, 160);
  return `${e.name || "Error"}${e.code ? "/" + e.code : ""}: ${msg}`;
}
export function debug(ctx, obj) {
  if (process.env.AGENT_KIT_HOOK_DEBUG !== "1") return;
  try {
    const dir = ctx && ctx.stateDir ? ctx.stateDir : path.join(KIT_DIR, ".state");
    appendLine(path.join(dir, "hook-debug.log"), { ts: new Date().toISOString(), conv: ctx ? ctx.convId : null, ...obj }, 1024 * 1024);
  } catch { /* never fail because of logging */ }
}
