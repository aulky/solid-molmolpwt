#!/usr/bin/env node
// Summarizes learning signals for /reflect: recent sessions, this conversation, and the lessons ledger.
// Zero dependencies, Node >= 18. Reads only .agents/.state/, .agents/memory/lessons.md, .agents/rules/90-lessons.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `Usage: node .agents/skills/reflect/scripts/session-stats.mjs [--last <n>] [--conv <id>] [--json] [--root <dir>]

Prints the signals /reflect needs, without dumping raw logs:
  Sessions      last <n> conversations in .agents/.state/sessions.jsonl (default 20): unverified finishes,
                verify failures, gate blocks, tool errors, models
  Conversation  newest .agents/.state/conv-*.json (or --conv <id>): failed checks, fail->pass, tool errors
  Lessons       .agents/memory/lessons.md counts, harmful or never-voted lessons, 90-lessons.md budget
  Signals       SIGNAL lines with the suggested next action

Options:
  --last <n>   number of recent conversations to aggregate (default 20)
  --conv <id>  conversation id to inspect instead of the newest state file
  --json       machine-readable output
  --root <dir> workspace root (default: four levels above this script)
  --help       show this help

Exit codes: 0 success (also when there is no data yet), 2 usage or internal error.`;

const LESSONS_CAP = 4500;
const LEDGER_RE = /^- \[(L-\d{4,})\] scope:(\S+)\s*\|\s*\+(\d+)\s+-(\d+)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.*)$/;
const SECRET_RE = /((?:api[_-]?key|token|secret|password|passwd|pwd|authorization|bearer)[\w-]*)(\s*[=:]\s*|\s+)("[^"]*"|'[^']*'|\S+)/gi;

function parseArgs(argv) {
  const o = { last: 20, conv: null, json: false, root: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`missing value for ${a}`);
      return argv[++i];
    };
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--last") o.last = Number(next());
    else if (a === "--conv") o.conv = next();
    else if (a === "--json") o.json = true;
    else if (a === "--root") o.root = next();
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!Number.isInteger(o.last) || o.last <= 0) throw new Error("--last must be a positive integer");
  if (o.conv && !/^[A-Za-z0-9_.-]+$/.test(o.conv)) throw new Error("--conv must be a plain conversation id");
  return o;
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "boolean" ? Number(v) : 0);
const day = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : "?");
const short = (id) => (id ? String(id).slice(0, 8) : "?");
const redact = (s) => String(s).replace(SECRET_RE, (_m, k, sep) => `${k}${sep}***`).slice(0, 120);

function readText(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return null; }
}

function sessions(stateDir, last) {
  const text = readText(path.join(stateDir, "sessions.jsonl"));
  const res = { file: ".agents/.state/sessions.jsonl", present: text !== null, lines: 0, bad: 0, convs: [] };
  if (!text) return res;
  const byConv = new Map(); // the Stop hook can log several lines per conversation: keep the latest
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    res.lines++;
    let r;
    try { r = JSON.parse(line); } catch { res.bad++; continue; }
    if (!r || typeof r !== "object") { res.bad++; continue; }
    const id = r.conversationId || `unknown-${res.lines}`;
    const prev = byConv.get(id);
    if (!prev || num(r.ts) >= num(prev.ts)) byConv.set(id, { ...r, stops: (prev ? prev.stops : 0) + 1 });
    else prev.stops++;
  }
  res.total = byConv.size;
  res.convs = [...byConv.values()].sort((a, b) => num(a.ts) - num(b.ts)).slice(-last);
  const c = res.convs;
  const models = {};
  for (const r of c) { const m = r.model || "unknown"; models[m] = (models[m] || 0) + 1; }
  res.summary = {
    count: c.length,
    from: c.length ? day(c[0].ts) : null,
    to: c.length ? day(c[c.length - 1].ts) : null,
    models,
    withCodeEdits: c.filter((r) => num(r.codeEdits) > 0).length,
    unverified: c.filter((r) => r.unverified === true || (num(r.codeEdits) > 0 && num(r.verifyPass) === 0)).length,
    withVerifyFail: c.filter((r) => num(r.verifyFail) > 0).length,
    gateBlocks: c.reduce((n, r) => n + num(r.gateBlocks), 0),
    convsBlocked: c.filter((r) => num(r.gateBlocks) > 0).length,
    toolErrors: c.reduce((n, r) => n + num(r.toolErrors), 0),
  };
  const worst = [...c].sort((a, b) => score(b) - score(a))[0];
  res.worst = worst && score(worst) > 0 ? { id: short(worst.conversationId), unverified: worst.unverified === true,
    toolErrors: num(worst.toolErrors), gateBlocks: num(worst.gateBlocks), verifyFail: num(worst.verifyFail) } : null;
  return res;
}
function score(r) {
  return num(r.toolErrors) + 2 * num(r.gateBlocks) + num(r.verifyFail) + (r.unverified === true ? 3 : 0);
}

function conversation(stateDir, conv) {
  let file = null;
  if (conv) file = path.join(stateDir, `conv-${conv}.json`);
  else if (fs.existsSync(stateDir)) {
    let best = null;
    for (const n of fs.readdirSync(stateDir)) {
      if (!/^conv-.+\.json$/.test(n)) continue;
      const t = fs.statSync(path.join(stateDir, n)).mtimeMs;
      if (!best || t > best.t) best = { n, t };
    }
    if (best) file = path.join(stateDir, best.n);
  }
  const text = file ? readText(file) : null;
  if (!text) return { present: false, file: file ? path.basename(file) : null };
  let s;
  try { s = JSON.parse(text); } catch { return { present: false, file: path.basename(file), error: "unreadable JSON" }; }
  const cmds = Array.isArray(s.commands) ? s.commands : [];
  const checks = cmds.filter((c) => c && c.kind && c.kind !== "other");
  const failed = checks.filter((c) => typeof c.exit === "number" && c.exit !== 0);
  const repeats = {};
  for (const c of failed) { const k = redact(c.cmd); repeats[k] = (repeats[k] || 0) + 1; }
  const editsObj = s.edits && typeof s.edits === "object" ? s.edits : {};
  const lastCode = num(s.lastCodeEditTs);
  return {
    present: true,
    file: path.basename(file),
    conversationId: short(s.conversationId),
    invocations: num(s.invocations),
    editedFiles: Object.keys(editsObj).length,
    checks: checks.length,
    checksPassed: checks.filter((c) => c.exit === 0).length,
    checksFailed: failed.length,
    checksUnknown: checks.filter((c) => typeof c.exit !== "number").length,
    failedChecks: failed.slice(-8).map((c) => ({ kind: c.kind, exit: c.exit, cmd: redact(c.cmd) })),
    repeatedFailures: Object.entries(repeats).filter(([, n]) => n >= 2).map(([cmd, n]) => ({ cmd, n })),
    sawFailThenPass: s.sawFailThenPass === true,
    toolErrors: num(s.toolErrors),
    gateBlocks: num(s.gate && (s.gate.totalBlocks ?? s.gate.blocks)),
    unverifiedCodeEdits: lastCode > 0 && num(s.lastVerifyPassTs) < lastCode,
  };
}

function lessons(root) {
  const ledgerText = readText(path.join(root, ".agents", "memory", "lessons.md"));
  const curatedPath = path.join(root, ".agents", "rules", "90-lessons.md");
  const curatedText = readText(curatedPath);
  const res = { ledger: ledgerText !== null, active: 0, retired: 0, malformed: 0, neverVoted: 0, harmful: [], unpromotedHelpful: [] };
  const promoted = new Set(curatedText ? curatedText.match(/L-\d{4,}/g) || [] : []);
  res.curatedBytes = curatedText === null ? null : Buffer.byteLength(curatedText, "utf8");
  res.curatedCap = LESSONS_CAP;
  res.promotedIds = promoted.size;
  if (!ledgerText) return res;
  let section = null;
  for (const line of ledgerText.split(/\r?\n/)) {
    if (/^## Active\b/.test(line)) { section = "active"; continue; }
    if (/^## Retired\b/.test(line)) { section = "retired"; continue; }
    if (/^## /.test(line)) { section = null; continue; }
    if (!section || !line.startsWith("- [L-")) continue;
    const m = line.match(LEDGER_RE);
    if (!m) { res.malformed++; continue; }
    if (section === "retired") { res.retired++; continue; }
    res.active++;
    const [, id, scope, h, x] = m;
    const helpful = Number(h), harmful = Number(x);
    if (helpful === 0 && harmful === 0) res.neverVoted++;
    if (harmful > 0) res.harmful.push({ id, scope, helpful, harmful });
    if (helpful >= 2 && harmful === 0 && !promoted.has(id)) res.unpromotedHelpful.push({ id, scope, helpful });
  }
  return res;
}

function signals(S, C, L) {
  const out = [];
  if (C.present) {
    if (C.sawFailThenPass) out.push("a check failed and later passed in this conversation -> if the cause was non-obvious, add ONE lesson (reflect step 3); otherwise say 'no lesson'");
    if (C.repeatedFailures.length) out.push(`the same failing check ran ${C.repeatedFailures[0].n}x (${C.repeatedFailures[0].cmd}) -> a repeated mistake: lesson candidate`);
    if (C.unverifiedCodeEdits) out.push("code edits since the last passing verify -> run /verify before finishing");
    if (C.toolErrors >= 3) out.push(`${C.toolErrors} tool errors in this conversation -> look for a wrong tool/arg pattern worth a lesson`);
    if (C.gateBlocks > 0) out.push(`the quality gate blocked ${C.gateBlocks}x -> check why the finish was premature`);
  }
  if (S.summary && S.summary.count) {
    const s = S.summary;
    if (s.unverified > 0) out.push(`${s.unverified} of ${s.count} recent conversations finished with unverified code edits -> vote on or strengthen the verify lesson; mention it to the user`);
    if (s.convsBlocked >= 2) out.push(`gate blocks in ${s.convsBlocked} recent conversations -> recurring premature finishes`);
  }
  if (L.harmful.length) out.push(`harmful votes on ${L.harmful.map((l) => l.id).join(", ")} -> review, then \`lessons.mjs retire <id> --reason "..."\` and drop it from 90-lessons.md`);
  if (L.unpromotedHelpful.length) out.push(`promotion candidates: ${L.unpromotedHelpful.map((l) => l.id).join(", ")} -> confirm with \`lessons.mjs promote-candidates\` (reflect step 5)`);
  if (L.curatedBytes !== null && L.curatedBytes > LESSONS_CAP * 0.9) out.push(`90-lessons.md is ${L.curatedBytes}/${LESSONS_CAP} B -> prune before promoting (reflect step 6)`);
  if (L.malformed) out.push(`${L.malformed} malformed ledger line(s) -> fix the format by hand (one line at a time)`);
  if (!out.length) out.push("no strong signals -> a short retro is enough; add a lesson only for a real surprise or correction");
  return out;
}

function printText(S, C, L, sig) {
  const o = [];
  o.push(`== Sessions (${S.file})`);
  if (!S.present) o.push("no sessions logged yet (the Stop hook writes one line per stop)");
  else {
    const s = S.summary;
    o.push(`${s.count} conversation(s) (last ${s.count} of ${S.total}), ${s.from} .. ${s.to}${S.bad ? `, ${S.bad} bad line(s) skipped` : ""}`);
    o.push(`models: ${Object.entries(s.models).map(([m, n]) => `${m} x${n}`).join(", ") || "none"}`);
    o.push(`with code edits: ${s.withCodeEdits} | finished unverified: ${s.unverified} | with verify failures: ${s.withVerifyFail} | gate blocks: ${s.gateBlocks} (in ${s.convsBlocked}) | tool errors: ${s.toolErrors}`);
    if (S.worst) o.push(`worst: conv ${S.worst.id} (unverified: ${S.worst.unverified}, tool errors: ${S.worst.toolErrors}, gate blocks: ${S.worst.gateBlocks}, verify failures: ${S.worst.verifyFail})`);
  }
  o.push(`== This conversation (${C.file || "no state file"})`);
  if (!C.present) o.push(C.error ? `state file ${C.error}` : "no conversation state yet");
  else {
    o.push(`id ${C.conversationId}: invocations ${C.invocations}, edited files ${C.editedFiles}, checks ${C.checks} (pass ${C.checksPassed}, fail ${C.checksFailed}, unknown ${C.checksUnknown})`);
    o.push(`fail->pass: ${C.sawFailThenPass ? "yes" : "no"} | tool errors: ${C.toolErrors} | gate blocks: ${C.gateBlocks} | unverified code edits: ${C.unverifiedCodeEdits ? "yes" : "no"}`);
    for (const f of C.failedChecks) o.push(`  failed [${f.kind}] exit ${f.exit}: ${f.cmd}`);
  }
  o.push("== Lessons (.agents/memory/lessons.md)");
  if (!L.ledger) o.push("no ledger found");
  else o.push(`active ${L.active}, retired ${L.retired}, never voted ${L.neverVoted}, malformed ${L.malformed}; harmful: ${L.harmful.map((l) => `${l.id}(+${l.helpful}/-${l.harmful})`).join(", ") || "none"}`);
  o.push(`90-lessons.md: ${L.curatedBytes === null ? "missing" : `${L.curatedBytes}/${L.curatedCap} B, ${L.promotedIds} lesson id(s) referenced`}`);
  o.push("== Signals");
  for (const s of sig) o.push(`SIGNAL: ${s}`);
  process.stdout.write(o.join("\n") + "\n");
}

function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) {
    process.stderr.write(`error: ${e.message}\n\n${USAGE}\n`);
    return 2;
  }
  if (o.help) { process.stdout.write(USAGE + "\n"); return 0; }
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(o.root || path.join(scriptDir, "..", "..", "..", ".."));
  if (!fs.existsSync(root)) { process.stderr.write(`error: root not found: ${root}\n`); return 2; }
  const stateDir = path.join(root, ".agents", ".state");
  const S = sessions(stateDir, o.last);
  const C = conversation(stateDir, o.conv);
  const L = lessons(root);
  const sig = signals(S, C, L);
  if (o.json) {
    const { convs, ...rest } = S;
    process.stdout.write(JSON.stringify({ sessions: rest, conversation: C, lessons: L, signals: sig }, null, 2) + "\n");
  } else printText(S, C, L, sig);
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  process.stderr.write(`error: ${e && e.message ? e.message : String(e)}\n`);
  process.exitCode = 2;
}
