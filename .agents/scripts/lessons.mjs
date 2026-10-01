#!/usr/bin/env node
// Lessons ledger CLI for .agents/memory/lessons.md (Frontier Kit, .agents/docs/architecture.md, learning loop). Zero dependencies.
// Line format: - [L-NNNN] scope:<area> | +<helpful> -<harmful> | <YYYY-MM-DD> | <lesson> | evidence: <where>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
export const LEDGER_REL = '.agents/memory/lessons.md';
export const CURATED_REL = '.agents/rules/90-lessons.md';
export const CURATED_CAP = 4500;

const USAGE = `Usage: node .agents/scripts/lessons.mjs <command> [options]

Commands:
  add --scope <area> --text "<when X, do Y because Z>" [--evidence "<file:line | command>"] [--date YYYY-MM-DD]
                          Append a lesson under "## Active" with the next free id (L-NNNN).
  list [--scope <area>] [--all]
                          Show active lessons (--all adds retired). Scope matches the area or its sub-areas.
  search <words...> [--all]
                          Lessons containing every word (case-insensitive); retired ones included with --all.
  vote <id> helpful|harmful
                          Increment a counter, e.g. vote L-0003 helpful.
  retire <id> [--reason "<why>"]
                          Move a wrong or obsolete lesson from "## Active" to "## Retired".
  stats                   Counts, votes, scopes, promotion candidates.
  promote-candidates      Active lessons with helpful >= 2, harmful 0, not yet in ${CURATED_REL}.

Common options:
  --json                  Machine-readable output.
  --root <dir>            Repository root (default: two levels above this script).
  --help, -h              Show this help.

Exit codes: 0 ok, 1 check failure (unknown id, duplicate lesson), 2 usage or internal error.
Ledger: ${LEDGER_REL}`;

export const LEDGER_TEMPLATE = [
  '# Lessons ledger',
  '',
  'Verified, reusable lessons. Managed with `node .agents/scripts/lessons.mjs` (run it with --help).',
  '- Before planning: `node .agents/scripts/lessons.mjs search <area words>` and apply what matches.',
  '- Record: `node .agents/scripts/lessons.mjs add --scope <area> --text "When X, do Y because Z." --evidence "<path:line or command>"`',
  '- Vote after reuse: `node .agents/scripts/lessons.mjs vote L-0001 helpful` (or `harmful`).',
  '- Promote: helpful >= 2 and harmful 0 -> `.agents/rules/90-lessons.md` (see `promote-candidates`); retire wrong ones with `retire`.',
  '- Line format: `- [L-NNNN] scope:<area> | +<helpful> -<harmful> | <YYYY-MM-DD> | <lesson> | evidence: <where>`',
  '- Never rewrite another lesson; add a new one or retire the old one.',
  '',
  '## Active',
  '',
  '## Retired',
  '',
].join('\n');

const LESSON_RE = /^\s*[-*]\s+\[L-(\d+)\]\s+scope:\s*([^|]*?)\s*\|\s*\+(\d+)\s+-(\d+)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.*?)(?:\s*\|\s*evidence:\s*(.*?))?\s*$/;

class UsageError extends Error {}
class CheckError extends Error {}

export function formatId(num) { return `L-${String(num).padStart(4, '0')}`; }

export function parseId(s) {
  const m = /^(?:L-?)?0*(\d+)$/i.exec(String(s ?? '').trim());
  return m ? Number(m[1]) : null;
}

export function formatLesson(l) {
  const ev = l.evidence && String(l.evidence).trim() ? String(l.evidence).trim() : 'none';
  return `- [${formatId(l.num)}] scope:${l.scope} | +${l.helpful} -${l.harmful} | ${l.date} | ${l.text} | evidence: ${ev}`;
}

/** Parse ledger text. Never throws. */
export function parseLedger(text) {
  const src = String(text ?? '');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const lines = src.split(/\r?\n/);
  const lessons = [];
  const malformed = [];
  const sections = { active: null, retired: null };
  let section = 'preamble';
  let maxNum = 0;
  let inFence = false;
  lines.forEach((line, idx) => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    for (const m of line.matchAll(/\[L-(\d{1,6})\]/g)) maxNum = Math.max(maxNum, Number(m[1]));
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      const name = h[1].toLowerCase();
      section = name.startsWith('active') ? 'active' : name.startsWith('retired') ? 'retired' : 'other';
      if ((section === 'active' || section === 'retired') && sections[section] === null) sections[section] = idx;
      return;
    }
    if (section !== 'active' && section !== 'retired') return;
    const m = LESSON_RE.exec(line);
    if (m) {
      lessons.push({
        id: formatId(Number(m[1])), num: Number(m[1]), scope: m[2].trim(), helpful: Number(m[3]),
        harmful: Number(m[4]), date: m[5], text: m[6].trim(), evidence: (m[7] ?? '').trim(),
        status: section, lineIndex: idx, line: idx + 1, raw: line,
      });
    } else if (/^\s*[-*]\s+\S/.test(line)) {
      malformed.push({ line: idx + 1, lineIndex: idx, section, raw: line });
    }
  });
  const ids = new Map();
  const duplicateIds = [];
  for (const l of lessons) {
    if (ids.has(l.num)) duplicateIds.push({ id: l.id, lines: [ids.get(l.num), l.line] });
    else ids.set(l.num, l.line);
  }
  return { eol, lines, lessons, malformed, sections, maxNum, duplicateIds };
}

function sectionEnd(lines, start) {
  // Index of the next "## " heading after start (or lines.length).
  for (let i = start + 1; i < lines.length; i++) if (/^##\s+/.test(lines[i])) return i;
  return lines.length;
}

function insertIntoSection(lines, sectionName, newLine) {
  const headingRe = sectionName === 'active' ? /^##\s+active\b/i : /^##\s+retired\b/i;
  let start = lines.findIndex((l) => headingRe.test(l));
  if (start < 0) {
    const retired = lines.findIndex((l) => /^##\s+retired\b/i.test(l));
    if (sectionName === 'active' && retired >= 0) {
      lines.splice(retired, 0, '## Active', '');
      start = retired;
    } else {
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      if (lines.length) lines.push('');
      lines.push(sectionName === 'active' ? '## Active' : '## Retired', '');
      start = lines.length - 2;
    }
  }
  const end = sectionEnd(lines, start);
  let last = start;
  for (let i = start + 1; i < end; i++) if (lines[i].trim() !== '') last = i;
  if (last === start) {
    // Empty section: normalise to heading, blank, lesson, blank.
    lines.splice(start + 1, end - start - 1, '', newLine, '');
    return;
  }
  lines.splice(last + 1, 0, newLine);
  if (lines[last + 2] !== undefined && /^##\s+/.test(lines[last + 2])) lines.splice(last + 2, 0, '');
}

function tokens(s) {
  return new Set(String(s).toLowerCase().match(/[a-z0-9_.-]{3,}/g) ?? []);
}

function similarity(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function normText(s) { return String(s).toLowerCase().replace(/\s+/g, ' ').trim(); }

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function scopeMatches(lessonScope, wanted) {
  const a = lessonScope.toLowerCase();
  const b = wanted.toLowerCase().replace(/^scope:/, '');
  return a === b || a.startsWith(b + '/') || a.startsWith(b + '-') || a.startsWith(b + '.');
}

function sleepMs(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* ignore */ }
}

function withLock(file, fn) {
  const lock = file + '.lock';
  let fd = null;
  for (let attempt = 0; attempt < 60 && fd === null; attempt++) {
    try { fd = fs.openSync(lock, 'wx'); } catch (e) {
      if (e && e.code === 'ENOENT') { fs.mkdirSync(path.dirname(file), { recursive: true }); continue; }
      try {
        const st = fs.statSync(lock);
        if (Date.now() - st.mtimeMs > 10000) { fs.rmSync(lock, { force: true }); continue; }
      } catch { /* lock vanished: retry */ }
      sleepMs(50);
    }
  }
  if (fd === null) throw new Error(`ledger is locked (${lock}); retry in a moment`);
  try { return fn(); } finally {
    try { fs.closeSync(fd); } catch { /* ignore */ }
    try { fs.rmSync(lock, { force: true }); } catch { /* ignore */ }
  }
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function readLedger(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Commands. Each returns { code, out: string[], json }.

export function cmdAdd(ctx, opts) {
  const scopeRaw = opts.scope;
  const textRaw = opts.text;
  if (typeof scopeRaw !== 'string' || !scopeRaw.trim()) throw new UsageError('add needs --scope <area>');
  if (typeof textRaw !== 'string' || !textRaw.trim()) throw new UsageError('add needs --text "<lesson>"');
  const scope = scopeRaw.trim().toLowerCase().replace(/^scope:/, '').replace(/[\s|]+/g, '-');
  if (!/^[a-z0-9][a-z0-9._/+#-]*$/.test(scope)) throw new UsageError(`invalid scope "${scopeRaw}": use letters, digits and - _ . / (e.g. rust/async)`);
  const text = textRaw.replace(/\s+/g, ' ').trim().replace(/\s*\|\s*evidence:/gi, ' / evidence:');
  if (text.length < 8) throw new UsageError('lesson text is too short; write "When X, do Y because Z."');
  const evidence = typeof opts.evidence === 'string' ? opts.evidence.replace(/\s+/g, ' ').trim() : '';
  const date = opts.date ?? today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UsageError('--date must be YYYY-MM-DD');

  return withLock(ctx.ledger, () => {
    const existing = readLedger(ctx.ledger);
    const src = existing ?? LEDGER_TEMPLATE;
    const led = parseLedger(src);
    const dup = led.lessons.find((l) => l.status === 'active' && normText(l.text) === normText(text));
    if (dup) {
      throw new CheckError(`Not added: identical to ${dup.id}. Vote instead: node .agents/scripts/lessons.mjs vote ${dup.id} helpful`);
    }
    const similar = led.lessons
      .filter((l) => l.status === 'active' && similarity(l.text, text) >= 0.6)
      .map((l) => l.id);
    const lesson = { num: led.maxNum + 1, scope, helpful: 0, harmful: 0, date, text, evidence };
    const line = formatLesson(lesson);
    const lines = led.lines.slice();
    insertIntoSection(lines, 'active', line);
    let out = lines.join(led.eol);
    if (!out.endsWith(led.eol)) out += led.eol;
    writeAtomic(ctx.ledger, out);
    const msg = [`Added ${formatId(lesson.num)} to ${rel(ctx, ctx.ledger)}${existing === null ? ' (created ledger)' : ''}`, line];
    if (similar.length) msg.push(`Similar active lessons: ${similar.join(', ')} - if one says the same thing, retire the new one and vote the old one.`);
    if (!/\bbecause\b|\bsince\b|->|→/i.test(text)) msg.push('Hint: include the reason ("... because ...") so the lesson stays useful.');
    return { code: 0, out: msg, json: { added: { ...lesson, id: formatId(lesson.num), line }, similar, created: existing === null } };
  });
}

function loadOrEmpty(ctx) {
  const text = readLedger(ctx.ledger);
  return { led: parseLedger(text ?? ''), missing: text === null };
}

function lessonJson(l) {
  const { lineIndex, raw, ...rest } = l;
  return rest;
}

export function cmdList(ctx, opts) {
  const { led, missing } = loadOrEmpty(ctx);
  let items = led.lessons.filter((l) => opts.all || l.status === 'active');
  if (typeof opts.scope === 'string' && opts.scope.trim()) items = items.filter((l) => scopeMatches(l.scope, opts.scope.trim()));
  const out = [];
  if (missing) out.push(`No ledger at ${rel(ctx, ctx.ledger)} yet (add a lesson to create it).`);
  for (const l of items) out.push(formatLesson(l) + (l.status === 'retired' ? '  (retired)' : ''));
  out.push(`${items.length} lesson(s)${opts.scope ? ` in scope ${opts.scope}` : ''}.`);
  for (const m of led.malformed) out.push(`WARN malformed line ${m.line}: ${m.raw.slice(0, 120)}`);
  return { code: 0, out, json: { lessons: items.map(lessonJson), malformed: led.malformed.map(({ lineIndex, ...m }) => m) } };
}

export function cmdSearch(ctx, opts, words) {
  if (!words.length) throw new UsageError('search needs at least one word');
  const terms = words.join(' ').toLowerCase().split(/\s+/).filter(Boolean);
  const { led, missing } = loadOrEmpty(ctx);
  const items = led.lessons
    .filter((l) => opts.all || l.status === 'active')
    .filter((l) => {
      const hay = `${l.id} scope:${l.scope} ${l.text} ${l.evidence}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1) || (b.helpful - b.harmful) - (a.helpful - a.harmful) || a.num - b.num);
  const out = [];
  if (missing) out.push(`No ledger at ${rel(ctx, ctx.ledger)} yet.`);
  for (const l of items) out.push(formatLesson(l) + (l.status === 'retired' ? '  (retired)' : ''));
  out.push(items.length ? `${items.length} match(es).` : `No lessons match "${terms.join(' ')}".`);
  return { code: 0, out, json: { query: terms, lessons: items.map(lessonJson) } };
}

function mutateLesson(ctx, idArg, fn) {
  const num = parseId(idArg);
  if (num === null) throw new UsageError(`invalid lesson id "${idArg ?? ''}" (expected L-NNNN)`);
  if (!fs.existsSync(ctx.ledger)) throw new CheckError(`No ledger at ${rel(ctx, ctx.ledger)}; nothing to update.`);
  return withLock(ctx.ledger, () => {
    const text = readLedger(ctx.ledger);
    if (text === null) throw new CheckError(`No ledger at ${rel(ctx, ctx.ledger)}; nothing to update.`);
    const led = parseLedger(text);
    const lesson = led.lessons.find((l) => l.num === num);
    if (!lesson) throw new CheckError(`Lesson ${formatId(num)} not found in ${rel(ctx, ctx.ledger)}.`);
    const lines = led.lines.slice();
    const result = fn(lesson, lines);
    let out = lines.join(led.eol);
    if (!out.endsWith(led.eol)) out += led.eol;
    writeAtomic(ctx.ledger, out);
    return result;
  });
}

export function cmdVote(ctx, opts, args) {
  const [idArg, kindRaw] = args;
  const kind = String(kindRaw ?? '').toLowerCase();
  if (!['helpful', 'harmful'].includes(kind)) throw new UsageError('vote needs: vote <id> helpful|harmful');
  return mutateLesson(ctx, idArg, (lesson, lines) => {
    if (kind === 'helpful') lesson.helpful++;
    else lesson.harmful++;
    const line = formatLesson(lesson);
    lines[lesson.lineIndex] = line;
    const msg = [`Voted ${kind}: ${lesson.id} is now +${lesson.helpful} -${lesson.harmful}`, line];
    if (lesson.status === 'active' && lesson.helpful >= 2 && lesson.harmful === 0) msg.push('Eligible for promotion: run promote-candidates.');
    if (lesson.harmful >= 2 && lesson.harmful >= lesson.helpful) msg.push(`Mostly harmful: consider "retire ${lesson.id} --reason ..."`);
    return { code: 0, out: msg, json: { lesson: lessonJson({ ...lesson, raw: line }) } };
  });
}

export function cmdRetire(ctx, opts, args) {
  const [idArg] = args;
  return mutateLesson(ctx, idArg, (lesson, lines) => {
    if (lesson.status === 'retired') throw new CheckError(`${lesson.id} is already retired.`);
    const reason = typeof opts.reason === 'string' && opts.reason.trim() ? opts.reason.replace(/\s+/g, ' ').trim() : '';
    const note = `retired ${opts.date ?? today()}${reason ? `: ${reason}` : ''}`;
    const updated = { ...lesson, status: 'retired', evidence: lesson.evidence && lesson.evidence !== 'none' ? `${lesson.evidence} (${note})` : `none (${note})` };
    lines.splice(lesson.lineIndex, 1);
    insertIntoSection(lines, 'retired', formatLesson(updated));
    return { code: 0, out: [`Retired ${lesson.id}.`, formatLesson(updated)], json: { lesson: lessonJson({ ...updated, raw: '' }) } };
  });
}

function curatedIds(ctx) {
  let text = '';
  let exists = true;
  try { text = fs.readFileSync(ctx.curated, 'utf8'); } catch { exists = false; }
  const ids = new Set();
  for (const m of text.matchAll(/\bL-(\d{1,6})\b/g)) ids.add(Number(m[1]));
  return { ids, bytes: Buffer.byteLength(text, 'utf8'), exists };
}

function candidates(led, curated) {
  return led.lessons.filter((l) => l.status === 'active' && l.helpful >= 2 && l.harmful === 0 && !curated.ids.has(l.num));
}

export function cmdPromote(ctx) {
  const { led, missing } = loadOrEmpty(ctx);
  const curated = curatedIds(ctx);
  const items = candidates(led, curated).sort((a, b) => b.helpful - a.helpful || a.num - b.num);
  const out = [];
  if (missing) out.push(`No ledger at ${rel(ctx, ctx.ledger)} yet.`);
  out.push(`Promote candidates (helpful >= 2, harmful 0, not yet in ${rel(ctx, ctx.curated)}): ${items.length}`);
  for (const l of items) out.push(formatLesson(l));
  const free = CURATED_CAP - curated.bytes;
  out.push(curated.exists
    ? `${rel(ctx, ctx.curated)}: ${curated.bytes} / ${CURATED_CAP} bytes used (${free} free).`
    : `${rel(ctx, ctx.curated)} does not exist yet (always_on rule, cap ${CURATED_CAP} bytes).`);
  if (items.length) out.push('Add each as "- <lesson, shortened> (L-NNNN)" under the matching group, prune if over the cap, then run node .agents/scripts/doctor.mjs.');
  return { code: 0, out, json: { candidates: items.map(lessonJson), curated: { file: rel(ctx, ctx.curated), exists: curated.exists, bytes: curated.bytes, cap: CURATED_CAP } } };
}

export function cmdStats(ctx) {
  const { led, missing } = loadOrEmpty(ctx);
  const active = led.lessons.filter((l) => l.status === 'active');
  const retired = led.lessons.filter((l) => l.status === 'retired');
  const helpful = active.reduce((s, l) => s + l.helpful, 0);
  const harmful = active.reduce((s, l) => s + l.harmful, 0);
  const scopes = {};
  for (const l of active) { const top = l.scope.split('/')[0]; scopes[top] = (scopes[top] ?? 0) + 1; }
  const curated = curatedIds(ctx);
  const cands = candidates(led, curated);
  const top = [...active].filter((l) => l.helpful > 0).sort((a, b) => b.helpful - a.helpful || a.num - b.num).slice(0, 5);
  const harmfulOnes = active.filter((l) => l.harmful > 0);
  const neverVoted = active.filter((l) => l.helpful === 0 && l.harmful === 0);
  const promoted = active.filter((l) => curated.ids.has(l.num)).length;
  const out = [];
  if (missing) out.push(`No ledger at ${rel(ctx, ctx.ledger)} yet.`);
  out.push(`Lessons: ${active.length} active, ${retired.length} retired, ${led.malformed.length} malformed line(s)`);
  out.push(`Votes (active): +${helpful} helpful, -${harmful} harmful`);
  out.push(`Scopes: ${Object.entries(scopes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
  out.push(`Promoted to 90-lessons: ${promoted}; promote candidates: ${cands.length}${cands.length ? ` (${cands.map((l) => l.id).join(', ')})` : ''}`);
  if (top.length) out.push(`Top helpful: ${top.map((l) => `${l.id} (+${l.helpful})`).join(', ')}`);
  if (harmfulOnes.length) out.push(`Review (harmful votes): ${harmfulOnes.map((l) => `${l.id} (+${l.helpful} -${l.harmful})`).join(', ')}`);
  if (neverVoted.length) out.push(`Never voted: ${neverVoted.length} (oldest ${neverVoted.map((l) => l.date).sort()[0]})`);
  for (const d of led.duplicateIds) out.push(`WARN duplicate id ${d.id} on lines ${d.lines.join(', ')}`);
  for (const m of led.malformed) out.push(`WARN malformed line ${m.line}: ${m.raw.slice(0, 120)}`);
  return {
    code: 0, out,
    json: {
      active: active.length, retired: retired.length, malformed: led.malformed.length, helpful, harmful, scopes,
      promoted, candidates: cands.map((l) => l.id), neverVoted: neverVoted.length, duplicateIds: led.duplicateIds,
    },
  };
}

// ---------------------------------------------------------------------------------------------
function rel(ctx, p) { return path.relative(ctx.root, p).split(path.sep).join('/') || '.'; }

const VALUE_OPTS = new Set(['scope', 'text', 'evidence', 'date', 'root', 'reason']);
const FLAG_OPTS = new Set(['json', 'all', 'help']);

export function parseArgs(argv) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h') { opts.help = true; continue; }
    if (a === '--') { pos.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = (eq > 0 ? a.slice(2, eq) : a.slice(2)).toLowerCase();
      if (FLAG_OPTS.has(key)) { opts[key] = true; continue; }
      if (!VALUE_OPTS.has(key)) throw new UsageError(`unknown option --${key}`);
      const val = eq > 0 ? a.slice(eq + 1) : argv[++i];
      if (val === undefined) throw new UsageError(`--${key} needs a value`);
      opts[key] = val;
      continue;
    }
    pos.push(a);
  }
  return { opts, pos };
}

export function run(argv, { root } = {}) {
  let parsed;
  try { parsed = parseArgs(argv); } catch (e) {
    return { code: 2, out: [], err: [`lessons: ${e.message}`, 'Run with --help for usage.'] };
  }
  const { opts, pos } = parsed;
  const [cmd, ...rest] = pos;
  if (opts.help || !cmd || cmd === 'help') return { code: cmd || opts.help ? 0 : 2, out: [USAGE], err: [] };
  const base = path.resolve(opts.root ?? root ?? DEFAULT_ROOT);
  const ctx = { root: base, ledger: path.join(base, LEDGER_REL), curated: path.join(base, CURATED_REL) };
  try {
    let r;
    switch (cmd) {
      case 'add': if (rest.length) throw new UsageError(`unexpected argument "${rest[0]}" (quote the --text value)`); r = cmdAdd(ctx, opts); break;
      case 'list': r = cmdList(ctx, opts); break;
      case 'search': r = cmdSearch(ctx, opts, rest); break;
      case 'vote': r = cmdVote(ctx, opts, rest); break;
      case 'retire': r = cmdRetire(ctx, opts, rest); break;
      case 'stats': r = cmdStats(ctx, opts); break;
      case 'promote-candidates': case 'promote': r = cmdPromote(ctx, opts); break;
      default: throw new UsageError(`unknown command "${cmd}"`);
    }
    return opts.json ? { code: r.code, out: [JSON.stringify(r.json, null, 2)], err: [] } : { code: r.code, out: r.out, err: [] };
  } catch (e) {
    if (e instanceof UsageError) return { code: 2, out: [], err: [`lessons: ${e.message}`, 'Run with --help for usage.'] };
    if (e instanceof CheckError) {
      return opts.json ? { code: 1, out: [JSON.stringify({ error: e.message })], err: [] } : { code: 1, out: [], err: [e.message] };
    }
    return { code: 2, out: [], err: [`lessons: internal error: ${e && e.message ? e.message : String(e)}`] };
  }
}

function isMain() {
  try {
    const a = path.resolve(fileURLToPath(import.meta.url));
    const b = path.resolve(process.argv[1] ?? '');
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch { return false; }
}

if (isMain()) {
  let r;
  try { r = run(process.argv.slice(2)); } catch (e) { r = { code: 2, out: [], err: [`lessons: internal error: ${e && e.message}`] }; }
  if (r.out.length) process.stdout.write(r.out.join('\n') + '\n');
  if (r.err.length) process.stderr.write(r.err.join('\n') + '\n');
  process.exitCode = r.code;
}
