// PreInvocation — injects ONE short ephemeralMessage: environment card + role card (invocation 0), pending notes
// queued by track-tools.mjs (then cleared), an unverified-edits nudge (every 4th invocation), the drift card
// (every 6th; [orchestrator] / [worker] / role-check card by role) and, for an orchestrator with dispatched
// workers, the phase ledger (every 5th) plus "waiting on <n>" on every invocation while workers are outstanding.
// Also records child replies (SYSTEM_MESSAGE "sender=<childId>"). Output budget ~180 tokens. Prints {} when
// there is nothing to say. Contract: .agents/docs/architecture.md (hooks, orchestrator mode).
import fs from "node:fs";
import path from "node:path";
import {
  runHook, loadState, saveState, withStateLock, readJson, readLastVerify, mergeLastVerify, resolvePending,
  unverifiedEdits, findGitRoot, findTool, runTool, IS_WIN, VERIFY_CMD, debug,
  ensureRole, linkChildren, scanReplies, phaseLedger, waitingList, WORKER_CARD,
} from "./lib.mjs";

const WORKER_REMINDER = "[worker] One task only: the one in your brief. Edit only its OWNED FILES; out of scope -> OUT OF SCOPE / INPUT GAP, never act. Verify after your last edit, then report once with send_message (Worker Report envelope). Never delegate.";
const ORCH_REMINDER = "[orchestrator] One task per worker; never edit workspace files. Wait for each worker's send_message before using its result; grade it by rerunning its evidence. Finish: verify.mjs yourself + Completion Report with the phase ledger.";
const ROLE_CARD = {
  orchestrator: "[orchestrator] You are the ORCHESTRATOR: plan, dispatch one task per worker, verify results. Pipeline: EXPLORE -> PREPARE -> IMPLEMENT -> REVIEW -> FIX -> TEST -> LEARN. You never edit workspace files. Runbook: /orchestrate.",
  worker: WORKER_CARD,
  // role unknown (transcript not readable yet): state the role check instead of guessing a role
  unknown: "[kit] Role check: if this conversation began with a message from another agent ([Message] ... sender=<id>) or with a brief (TASK: T<n> | ... AGENT:), you are a WORKER (do only your brief's task, report with send_message); otherwise you are the ORCHESTRATOR (runbook: /orchestrate).",
};
const MAX_CHARS = 760;
const NOTE_CHARS = 480;

const exists = (p) => { try { fs.statSync(p); return true; } catch { return false; } };

function packageManager(root) {
  if (exists(path.join(root, "bun.lock")) || exists(path.join(root, "bun.lockb"))) return "bun";
  if (exists(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (exists(path.join(root, "yarn.lock"))) return "yarn";
  if (exists(path.join(root, "package-lock.json"))) return "npm";
  return exists(path.join(root, "package.json")) ? "npm" : null;
}

function quickStacks(root) {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(root); } catch { return out; }
  const has = (n) => names.includes(n);
  const any = (re) => names.some((n) => re.test(n));
  if (has("package.json")) out.push(has("deno.json") ? "node/deno" : "node");
  if (has("Cargo.toml")) out.push("rust");
  if (has("go.mod")) out.push("go");
  if (has("pyproject.toml") || any(/^requirements.*\.txt$/)) out.push("python");
  if (has("composer.json")) out.push("php");
  if (has("pom.xml") || any(/^build\.gradle/)) out.push("jvm");
  if (any(/\.(csproj|sln)$/)) out.push("dotnet");
  if (has("Gemfile")) out.push("ruby");
  if (has("pubspec.yaml")) out.push("dart");
  if (has("mix.exs")) out.push("elixir");
  if (has("Package.swift")) out.push("swift");
  if (has("CMakeLists.txt")) out.push("c/cpp");
  return out;
}

// stack.json is written by activate-stack.mjs; read it tolerantly (strings or {id|name} objects).
function stackFromState(ctx) {
  const j = readJson(path.join(ctx.stateDir, "stack.json"));
  if (!j || typeof j !== "object") return null;
  const pick = (v) => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : x && (x.id || x.name || x.stack))).filter((x) => typeof x === "string") : []);
  const items = [...new Set([...pick(j.stacks), ...pick(j.languages), ...pick(j.frameworks), ...pick(j.detected), ...pick(j.active)])];
  const pm = typeof j.packageManager === "string" ? j.packageManager : typeof j.pm === "string" ? j.pm : null;
  return items.length || pm ? { items: items.slice(0, 8), pm } : null;
}

function gitInfo(ctx) {
  const gitRoot = findGitRoot(ctx.root);
  if (!gitRoot) return "not a git repo";
  let branch = "?";
  try {
    let gitDir = path.join(gitRoot, ".git");
    if (fs.statSync(gitDir).isFile()) {
      const m = /gitdir:\s*(.+)/.exec(fs.readFileSync(gitDir, "utf8"));
      if (m) gitDir = path.resolve(gitRoot, m[1].trim());
    }
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    branch = head.startsWith("ref:") ? head.replace(/^ref:\s*refs\/heads\//, "") : `detached ${head.slice(0, 8)}`;
  } catch { /* keep ? */ }
  const git = findTool(ctx.stateDir, "git");
  if (!git) return `branch ${branch} (git CLI not found)`;
  const r = runTool(git, ["status", "--porcelain", "--untracked-files=no"], { timeout: 2000, cwd: gitRoot });
  if (r.error || r.status !== 0) return `branch ${branch}`;
  const n = String(r.stdout || "").split(/\r?\n/).filter(Boolean).length;
  return `branch ${branch}, ${n ? `${n} tracked files changed` : "clean"}`;
}

function envCard(ctx) {
  const osName = IS_WIN ? "Windows" : process.platform === "darwin" ? "macOS" : process.platform === "linux" ? "Linux" : process.platform;
  const shell = IS_WIN ? "run_command uses PowerShell on Windows" : "run_command uses a POSIX shell";
  const st = stackFromState(ctx);
  const pm = (st && st.pm) || packageManager(ctx.root);
  const items = st && st.items.length ? st.items : quickStacks(ctx.root);
  const stack = `${items.join(", ") || "unknown"}${pm ? ` (pm: ${pm})` : ""}`;
  let verify = VERIFY_CMD;
  if (!exists(path.join(ctx.root, ".agents", "scripts", "verify.mjs"))) {
    const pkg = readJson(path.join(ctx.root, "package.json"));
    verify = pkg && pkg.scripts && pkg.scripts.test ? `${pm || "npm"} run test` : "none found (use the project's own test command)";
  }
  return `[kit] Env: ${osName}; ${shell}. Workspace: ${ctx.root}. Stack: ${stack}. Git: ${gitInfo(ctx)}. Verify: ${verify}`;
}

// Fit parts into the budget by priority (lower = more important), then output in natural order.
function assemble(parts) {
  const chosen = new Set();
  let used = 0;
  for (const p of [...parts].sort((a, b) => a.pri - b.pri)) {
    if (used + p.text.length + 1 <= MAX_CHARS) { chosen.add(p); used += p.text.length + 1; }
  }
  const dropped = parts.length - chosen.size;
  const lines = parts.filter((p) => chosen.has(p)).map((p) => p.text);
  if (dropped) lines.push(`[kit] (${dropped} more note(s) omitted for length)`);
  return lines.join("\n");
}

async function main(payload, ctx) {
  if (!payload) return {};
  let result = {};
  withStateLock(ctx, () => {
    const state = loadState(ctx);
    const n = Number.isInteger(payload.invocationNum) ? payload.invocationNum : state.invocations;
    state.invocations += 1;
    state.lastInvocationTs = Date.now();
    resolvePending(state, ctx);
    mergeLastVerify(state, readLastVerify(ctx));
    const role = ensureRole(state, ctx);
    const orch = role !== "worker"; // null counts as orchestrator for reminders (.agents/docs/architecture.md)
    if (orch && state.dispatches.length) {
      if (state.dispatches.some((d) => !d.child)) linkChildren(state, ctx);
      scanReplies(state, ctx);
    }

    const parts = [];
    if (n === 0) {
      parts.push({ pri: 2, text: envCard(ctx) });
      parts.push({ pri: 1, text: ROLE_CARD[role || "unknown"] });
    }
    for (const p of state.pending) {
      const t = p.text.length > NOTE_CHARS ? p.text.slice(0, NOTE_CHARS) + "…" : p.text;
      parts.push({ pri: 0, text: /^\[(?:kit|orchestrator|worker)\] /.test(t) ? t : `[kit] ${t}` });
    }
    state.pending = [];
    const unverified = unverifiedEdits(state);
    if (unverified.length && n % 4 === 0) {
      parts.push({ pri: 1, text: `[kit] Unverified edits in ${unverified.length} files — run \`${VERIFY_CMD}\` before finishing.` });
    }
    if (orch && n > 0 && n % 5 === 0 && state.dispatches.length) parts.push({ pri: 1, text: phaseLedger(state) });
    if (orch && state.dispatches.length) {
      const waiting = waitingList(state);
      if (waiting.length) {
        const list = waiting.slice(0, 6).join(", ") + (waiting.length > 6 ? ` +${waiting.length - 6} more` : "");
        parts.push({ pri: 0, text: `[orchestrator] waiting on ${waiting.length}: ${list} - do not answer for them` });
      }
    }
    if (n > 0 && n % 6 === 0) parts.push({ pri: 3, text: role === "orchestrator" ? ORCH_REMINDER : role === "worker" ? WORKER_REMINDER : ROLE_CARD.unknown });
    saveState(ctx, state);
    debug(ctx, { hook: "inject", n, role, parts: parts.length, unverified: unverified.length });
    if (parts.length) result = { injectSteps: [{ ephemeralMessage: assemble(parts) }] };
  });
  return result;
}

runHook({ name: "inject-context", fallback: {}, budgetMs: 8000, main });
