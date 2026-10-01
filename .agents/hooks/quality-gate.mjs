// Stop — deterministic completion gate. Blocks stopping (decision "continue") when:
//  (1) code changed after the last passing check, (2) the diff adds test skips / suppressions or removes
//  assertions (once), (3) ORCHESTRATOR only: early answer — its latest response holds a Completion Report while
//  workers are still outstanding, (4) ORCHESTRATOR only: PIPELINE GATE — after IMPLEMENT/FIX work, REVIEW / TEST
//  PASS / a full verify / LEARN PASS is missing and no worker is still outstanding (max 3 blocks per round and
//  missing set), (5) a check failed and later passed (learning nudge, once; worker/orchestrator wording differs).
// Never blocks on error / max-steps / cancel terminations or after 2 consecutive blocks (3 for the orchestrator).
// Always appends a metrics line to .agents/.state/sessions.jsonl. Prints {} to allow the stop. Contract:
// .agents/docs/architecture.md (hooks, pipeline semantics hardened, see lib.pipelineCheck).
import path from "node:path";
import {
  runHook, loadState, saveState, withStateLock, appendLine, readLastVerify, mergeLastVerify, resolvePending,
  unverifiedEdits, relPath, isInside, findGitRoot, findTool, runTool, VERIFY_CMD, debug,
  ensureRole, linkChildren, scanReplies, pipelineCheck, waitingList, latestModelText, hasCompletionReport, isCheckKind,
} from "./lib.mjs";

// error / max_steps / MAX_INVOCATIONS / USER_CANCELED / MAX_TOKEN_BUDGET / HALTED_STEP / TERMINAL_CUSTOM_HOOK / INJECTED_RESPONSE
const ABNORMAL = /error|max|cancel|budget|halt|abort|timeout|interrupt|kill|hook|inject/i;
const MARKERS = [
  [/\b(?:it|test|describe|context|suite)\.(?:skip|skipIf|todo)\s*\(|\bthis\.skip\s*\(/, ".skip("],
  [/\b(?:it|test|describe|context|suite)\.only\s*\(/, ".only("],
  [/\bx(?:it|describe|test)\s*\(/, "xit("],
  [/@Disabled\b/, "@Disabled"],
  [/#\[ignore\b/, "#[ignore]"],
  [/\bt\.Skip(?:f|Now)?\s*\(/, "t.Skip("],
  [/@pytest\.mark\.(?:skip|skipif|xfail)\b|\bpytest\.skip\s*\(|@unittest\.skip/, "@pytest.mark.skip"],
  [/markTestSkipped|markTestIncomplete/, "markTestSkipped"],
  [/@ts-ignore\b/, "@ts-ignore"],
  [/@ts-expect-error\b/, "@ts-expect-error"],
  [/@ts-nocheck\b/, "@ts-nocheck"],
  [/eslint-disable/, "eslint-disable"],
  [/biome-ignore/, "biome-ignore"],
  [/#\s*type:\s*ignore/, "# type: ignore"],
  [/\/\/\s*nolint\b/, "//nolint"],
  [/\[Fact\s*\(\s*Skip\s*=|\[Ignore\b/, "[Ignore]"],
];
const ASSERT_RE = /\b(?:expect|assert\w*|should\w*|require\.\w+|t\.(?:Error|Errorf|Fatal|Fatalf|Fail\w*)|XCTAssert\w*|refute\w*)\s*[(.!]|\bassert\s+\S/;
const TEST_FILE = /(^|\/)(tests?|__tests__|spec|specs|e2e)\/|\.(test|spec)\.|(^|\/)test_[^/]*$|_test\.\w+$|_spec\.\w+$|Tests?\.\w+$/;

function tamperCheck(state, ctx) {
  const files = Object.keys(state.edits).filter((p) => isInside(p, ctx.root));
  if (!files.length) return null;
  const gitRoot = findGitRoot(ctx.root);
  if (!gitRoot) return null;
  const git = findTool(ctx.stateDir, "git");
  if (!git) return null;
  const rels = files.map((f) => relPath(f, gitRoot)).filter((r) => !/^[A-Za-z]:\/|^\//.test(r)).slice(0, 150);
  if (!rels.length) return null;
  const base = ["-c", "core.quotepath=off", "diff", "--no-color", "--no-ext-diff", "--unified=0"];
  let r = runTool(git, [...base, "HEAD", "--", ...rels], { timeout: 5000, cwd: gitRoot });
  if (!r.error && r.status !== 0) r = runTool(git, [...base, "--", ...rels], { timeout: 5000, cwd: gitRoot }); // no commits yet
  if (r.error || r.status !== 0 || !r.stdout) return null;
  const hits = [];
  const asserts = new Map(); // file -> net removed assertion lines
  let file = null;
  let inHeader = false;
  for (const line of r.stdout.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) { inHeader = true; file = null; continue; }
    if (inHeader) {
      if (line.startsWith("+++ ")) file = line.slice(4).replace(/^b\//, "").trim();
      if (line.startsWith("@@")) inHeader = false;
      continue;
    }
    if (!file || file === "/dev/null") continue;
    const isTest = TEST_FILE.test(file);
    if (line.startsWith("+")) {
      const t = line.slice(1);
      for (const [re, label] of MARKERS) if (re.test(t)) { hits.push(`${file}: ${label}`); break; }
      if (isTest && ASSERT_RE.test(t)) asserts.set(file, (asserts.get(file) || 0) - 1);
    } else if (line.startsWith("-") && isTest && ASSERT_RE.test(line.slice(1))) {
      asserts.set(file, (asserts.get(file) || 0) + 1);
    }
  }
  for (const [f, n] of asserts) if (n > 0) hits.push(`${f}: ${n} assertion line(s) removed`);
  return hits.length ? [...new Set(hits)] : null;
}

const LEARN_TEXT = {
  worker: 'LEARNING: a check failed and you fixed it. Put the non-obvious cause as a one-line "Lesson candidates:" entry in your Worker Report (the scribe records it). Then send the report with send_message.',
  // the orchestrator never writes .agents/ itself (.agents/docs/architecture.md, roles): the lesson goes into the scribe's LEARN brief
  orchestrator: "LEARNING: a check failed and later passed. If the cause was non-obvious, put it as a Lesson candidate in the scribe's LEARN brief (do not record it yourself); if nothing reusable was learned, say 'no lesson' in the Completion Report.",
  other: "LEARNING: a check failed and you fixed it. If the cause was non-obvious, record ONE lesson: `node .agents/scripts/lessons.mjs add --scope <area> --text \"...\" --evidence \"...\"`. If nothing reusable was learned, say 'no lesson' and finish.",
};
const MISSING = {
  REVIEW: "REVIEW (no reviewer dispatched after the last IMPLEMENT/FIX dispatch)",
  TEST: "TEST (no PASS report from a test-engineer / e2e-tester after the last IMPLEMENT/FIX result, or one reported FAIL)",
  VERIFY: "a passing full verify.mjs run (not --quick) after the last TEST result",
  LEARN: "LEARN (no scribe PASS report after the last TEST result)",
};
const pipelineReason = (missing) => `PIPELINE GATE: the pipeline is incomplete after the last implementation: missing ${missing.map((m) => MISSING[m]).join("; ")}. Dispatch the missing phase(s) (REVIEW -> reviewer, TEST -> test-engineer / e2e-tester, LEARN -> scribe) and run node .agents/scripts/verify.mjs (full, no --quick) yourself. REVIEW, TEST, VERIFY and LEARN are never skipped; only e2e may be "not applicable" (UI-free change), stated in the Completion Report.`;
const earlyReason = (labels) => `PIPELINE GATE: ${labels.length} worker(s) have not reported (${labels.join(", ")}). Do not report results you have not received; end your turn with the task board and wait.`;

function gateReason(files, ctx, payload, worker) {
  const rels = files.map((f) => relPath(f, ctx.root));
  const n = rels.length;
  const eg = rels.slice(0, 2).join(", ");
  const finish = worker
    ? "then send your Worker Report with send_message (command + result under Evidence)"
    : "then finish with the Completion Report including the command and its result";
  let reason = `QUALITY GATE: you changed code (${n} file${n === 1 ? "" : "s"}, e.g. ${eg}) but no passing verification ran after your last edit. Run \`${VERIFY_CMD}\` (or the project's own test/typecheck command), fix every failure, ${finish}. If verification is impossible here, say exactly why in the report.`;
  if (payload.fullyIdle === false) reason += " A background task is still running: if it is your verification, wait for its result (manage_task status) instead of starting a new run.";
  return reason;
}

async function main(payload, ctx) {
  if (!payload) return {};
  const why = String(payload.terminationReason ?? "");
  const err = typeof payload.error === "string" ? payload.error.trim() : payload.error ? "error" : "";
  const abnormal = ABNORMAL.test(why) || !!err;
  let out = {};

  withStateLock(ctx, () => {
    const state = loadState(ctx);
    resolvePending(state, ctx);
    const lv = readLastVerify(ctx);
    mergeLastVerify(state, lv);
    const role = ensureRole(state, ctx);
    const worker = role === "worker";
    if (!worker && state.dispatches.length) {
      if (state.dispatches.some((d) => !d.child)) linkChildren(state, ctx);
      scanReplies(state, ctx);
    }
    // PIPELINE GATE: only a detected orchestrator that dispatched IMPLEMENT/FIX work. Max 3 blocks per
    // (round, missing set): the budget renews when a new IMPLEMENT/FIX dispatch arrives or a phase is satisfied
    // (progress), so REVIEW and TEST cannot use up the blocks that enforce verify and LEARN; a stop that changes
    // nothing (e.g. a "thanks" turn) stays capped after 3.
    const pipe = role === "orchestrator" ? pipelineCheck(state, lv) : { applies: false, missing: [] };
    const roundKey = pipe.applies ? `${pipe.key}|${pipe.missing.join(",")}` : "";
    if (pipe.applies && state.gate.pipelineFor !== roundKey) { state.gate.pipelineFor = roundKey; state.gate.pipelineBlocks = 0; }
    if (pipe.applies && !pipe.missing.length) state.gate.pipelineBlocks = 0;

    const unverified = unverifiedEdits(state);
    const orch = role === "orchestrator";
    const cap = orch ? 3 : 2;
    let blockedBy = null;
    if (!abnormal && state.gate.blocks < cap) {
      if (unverified.length) {
        out = { decision: "continue", reason: gateReason(unverified, ctx, payload, worker) };
        blockedBy = "verify";
      } else if (!state.gate.tamperNudged) {
        const hits = tamperCheck(state, ctx);
        if (hits) {
          state.gate.tamperNudged = true;
          const list = hits.slice(0, 4).join("; ") + (hits.length > 4 ? `; +${hits.length - 4} more` : "");
          out = {
            decision: "continue",
            reason: `TEST INTEGRITY: your changes add test skips/suppressions or remove assertions (${list}). For each one, either revert it and fix the real problem, or justify it in the ${worker ? "Worker Report" : "Completion Report"}. Never weaken or skip tests to make a check pass.`,
          };
          blockedBy = "tamper";
        }
      }
      // Early answer: a Completion Report while workers are still outstanding reports results not received yet.
      if (!blockedBy && orch && state.dispatches.length) {
        const labels = waitingList(state);
        if (labels.length && hasCompletionReport(latestModelText(ctx))) {
          out = { decision: "continue", reason: earlyReason(labels) };
          blockedBy = "early";
        }
      }
      // Never while a worker is outstanding (legitimate waiting) or while a background task runs.
      if (!blockedBy && pipe.applies && pipe.missing.length && pipe.waiting === 0 && payload.fullyIdle !== false
        && state.gate.pipelineBlocks < 3) {
        state.gate.pipelineBlocks += 1;
        out = { decision: "continue", reason: pipelineReason(pipe.missing) };
        blockedBy = "pipeline";
      }
      // Workers get no learning nudge: their Worker Report already has a mandatory "Lesson candidates:" line, and a
      // Stop-time nudge fires AFTER send_message, making the worker re-report (seen live: a plain follow-up message).
      if (!blockedBy && !worker && state.sawFailThenPass && !state.gate.learningNudged) {
        state.gate.learningNudged = true;
        out = { decision: "continue", reason: role === "orchestrator" ? LEARN_TEXT.orchestrator : worker ? LEARN_TEXT.worker : LEARN_TEXT.other };
        blockedBy = "learning";
      }
    }
    if (blockedBy) { state.gate.blocks += 1; state.gate.totalBlocks += 1; } else state.gate.blocks = 0;

    const edits = Object.values(state.edits);
    const checks = state.commands.filter((c) => isCheckKind(c.kind));
    try {
      appendLine(path.join(ctx.stateDir, "sessions.jsonl"), {
        ts: Date.now(),
        conversationId: ctx.convId,
        model: typeof payload.modelName === "string" ? payload.modelName : null,
        edits: edits.length,
        codeEdits: edits.filter((e) => e.code).length,
        verifyPass: checks.filter((c) => c.exit === 0).length,
        verifyFail: checks.filter((c) => typeof c.exit === "number" && c.exit !== 0).length,
        toolErrors: state.toolErrors,
        gateBlocks: state.gate.totalBlocks,
        unverified: unverified.length > 0,
        blocked: blockedBy,
        terminationReason: why.slice(0, 60) || null,
        role,
        dispatches: state.dispatches.length,
        pipelineBlocked: blockedBy === "pipeline" || blockedBy === "early",
      });
    } catch { /* metrics are best effort */ }
    saveState(ctx, state);
    debug(ctx, { hook: "gate", role, blockedBy, missing: pipe.missing.join(","), abnormal, unverified: unverified.length, blocks: state.gate.blocks });
  });
  return out;
}

runHook({ name: "quality-gate", fallback: {}, budgetMs: 18000, main });
