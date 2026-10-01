// node --test .agents/scripts/test/lessons.test.mjs  -- lessons.mjs on temp ledgers.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run, parseLedger, formatLesson, parseId, LEDGER_REL, CURATED_REL } from '../lessons.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, '..', 'lessons.mjs');
const TMP_BASE = process.env.FRONTIER_KIT_TMP || os.tmpdir();
fs.mkdirSync(TMP_BASE, { recursive: true });
const TMP = fs.mkdtempSync(path.join(TMP_BASE, 'lessons-test-'));
after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

const LINE_RE = /^- \[L-\d{4}\] scope:[a-z0-9._/+#-]+ \| \+\d+ -\d+ \| \d{4}-\d{2}-\d{2} \| .+ \| evidence: .+$/;
let seq = 0;
function freshRoot(ledger, curated) {
  const root = path.join(TMP, `r-${++seq}`);
  fs.mkdirSync(root, { recursive: true });
  if (ledger !== undefined) {
    fs.mkdirSync(path.join(root, '.agents', 'memory'), { recursive: true });
    fs.writeFileSync(path.join(root, LEDGER_REL), ledger);
  }
  if (curated !== undefined) {
    fs.mkdirSync(path.join(root, '.agents', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(root, CURATED_REL), curated);
  }
  return root;
}
const L = (root, ...args) => run(args, { root });
const ledgerText = (root) => fs.readFileSync(path.join(root, LEDGER_REL), 'utf8');

const SEEDED = [
  '# Lessons ledger',
  'Usage: see lessons.mjs --help. Example: vote L-0001 helpful.',
  '',
  '## Active',
  '',
  '- [L-0001] scope:platform | +3 -0 | 2026-09-20 | invoke_subagent is async; wait for the message because the parent answered null | evidence: probe run 5',
  '- [L-0002] scope:tooling/windows | +2 -0 | 2026-09-21 | use python not python3 because python3 is a Store stub | evidence: shell',
  '- [L-0003] scope:rust/async | +2 -1 | 2026-09-22 | never block inside async fns because it stalls the runtime | evidence: cargo test | flaky',
  '- [L-0004] scope:tooling | +0 -0 | 2026-09-23 | use search.mjs since rg is not installed | evidence: none',
  '',
  '## Retired',
  '',
  '- [L-0007] scope:old | +0 -2 | 2026-09-01 | an obsolete lesson that was wrong | evidence: none',
  '',
].join('\n');

describe('ledger format', () => {
  test('parse + format round-trip keeps the exact line format', () => {
    const led = parseLedger(SEEDED);
    assert.equal(led.lessons.length, 5);
    assert.equal(led.maxNum, 7);
    const l3 = led.lessons.find((l) => l.num === 3);
    assert.equal(l3.scope, 'rust/async');
    assert.equal(l3.helpful, 2);
    assert.equal(l3.harmful, 1);
    assert.equal(l3.evidence, 'cargo test | flaky');
    for (const l of led.lessons) assert.equal(formatLesson(l), l.raw);
    assert.equal(led.lessons.find((l) => l.num === 7).status, 'retired');
    assert.deepEqual(led.malformed, []);
  });
  test('ids: L-3, 3, l-0003 all resolve', () => {
    assert.equal(parseId('L-3'), 3);
    assert.equal(parseId('3'), 3);
    assert.equal(parseId('l-0003'), 3);
    assert.equal(parseId('X-3'), null);
  });
});

describe('lessons add', () => {
  test('creates the ledger with header and L-0001 when missing', () => {
    const root = freshRoot();
    const r = L(root, 'add', '--scope', 'Platform', '--text', 'When X happens, do Y because Z.', '--evidence', 'probe.json:12', '--date', '2026-09-24');
    assert.equal(r.code, 0, r.err.join('\n'));
    const text = ledgerText(root);
    assert.match(text, /^# Lessons ledger\n/);
    const lines = text.split('\n');
    const idx = lines.indexOf('## Active');
    assert.ok(idx > 0 && idx < 16, 'header <= 15 lines');
    const line = lines.find((l) => l.startsWith('- [L-'));
    assert.equal(line, '- [L-0001] scope:platform | +0 -0 | 2026-09-24 | When X happens, do Y because Z. | evidence: probe.json:12');
    assert.match(line, LINE_RE);
    assert.ok(lines.indexOf(line) > idx && lines.indexOf(line) < lines.indexOf('## Retired'));
  });
  test('appends under Active (before Retired) with the next free id, default date today', () => {
    const root = freshRoot(SEEDED);
    const r = L(root, 'add', '--scope', 'css', '--text', 'Tailwind v4 has no tailwind.config because config lives in CSS');
    assert.equal(r.code, 0, r.err.join('\n'));
    const lines = ledgerText(root).split('\n');
    const i = lines.findIndex((l) => l.startsWith('- [L-0008]'));
    assert.ok(i > lines.indexOf('- [L-0004] scope:tooling | +0 -0 | 2026-09-23 | use search.mjs since rg is not installed | evidence: none'));
    assert.ok(i < lines.indexOf('## Retired'));
    assert.match(lines[i], LINE_RE);
    assert.match(lines[i], /evidence: none$/);
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    assert.ok(lines[i].includes(`| ${today} |`));
    assert.equal(lines[i + 1], '');
  });
  test('rejects duplicates (exit 1) and bad input (exit 2)', () => {
    const root = freshRoot(SEEDED);
    const dup = L(root, 'add', '--scope', 'x', '--text', 'Use python  not python3 because python3 is a Store stub');
    assert.equal(dup.code, 1);
    assert.match(dup.err.join('\n'), /identical to L-0002/);
    assert.equal(L(root, 'add', '--text', 'no scope given here').code, 2);
    assert.equal(L(root, 'add', '--scope', 'x').code, 2);
    assert.equal(L(root, 'add', '--scope', 'bad|scope!', '--text', 'something long enough').code, 2);
    assert.equal(L(root, 'add', '--scope', 'x', '--text', 'long enough text', '--date', '24.09.2026').code, 2);
    assert.equal(ledgerText(root), SEEDED, 'ledger unchanged');
  });
  test('multi-line text is flattened; "| evidence:" in text cannot break parsing', () => {
    const root = freshRoot(SEEDED);
    const r = L(root, 'add', '--scope', 'x', '--text', 'line one\nline two | evidence: fake because tests', '--evidence', 'a | b');
    assert.equal(r.code, 0);
    const led = parseLedger(ledgerText(root));
    const l = led.lessons.find((x) => x.num === 8);
    assert.equal(l.text, 'line one line two / evidence: fake because tests');
    assert.equal(l.evidence, 'a | b');
  });
  test('preserves CRLF line endings and warns about similar lessons', () => {
    const root = freshRoot(SEEDED.replace(/\n/g, '\r\n'));
    const r = L(root, 'add', '--scope', 'platform', '--text', 'invoke_subagent is async; wait for the message because the parent answered null early');
    assert.equal(r.code, 0);
    assert.match(r.out.join('\n'), /Similar active lessons: L-0001/);
    const text = ledgerText(root);
    assert.ok(!/[^\r]\n/.test(text), 'all newlines are CRLF');
  });
  test('adds an Active section when the file has none', () => {
    const root = freshRoot('# Lessons ledger\n\n## Retired\n');
    assert.equal(L(root, 'add', '--scope', 'a', '--text', 'a lesson because reasons').code, 0);
    const lines = ledgerText(root).split('\n');
    assert.ok(lines.indexOf('## Active') < lines.indexOf('## Retired'));
    assert.ok(lines.findIndex((x) => x.startsWith('- [L-0001]')) < lines.indexOf('## Retired'));
  });
});

describe('lessons list / search', () => {
  test('list filters by scope and sub-scope; --all adds retired', () => {
    const root = freshRoot(SEEDED);
    const all = L(root, 'list', '--json');
    assert.deepEqual(JSON.parse(all.out[0]).lessons.map((l) => l.id), ['L-0001', 'L-0002', 'L-0003', 'L-0004']);
    const tooling = JSON.parse(L(root, 'list', '--scope', 'tooling', '--json').out[0]).lessons.map((l) => l.id);
    assert.deepEqual(tooling, ['L-0002', 'L-0004']);
    const withRetired = JSON.parse(L(root, 'list', '--all', '--json').out[0]).lessons.map((l) => l.id);
    assert.ok(withRetired.includes('L-0007'));
    const text = L(root, 'list').out.join('\n');
    assert.match(text, /^- \[L-0001\] scope:platform/m);
    assert.match(text, /4 lesson\(s\)\./);
  });
  test('search ANDs words case-insensitively', () => {
    const root = freshRoot(SEEDED);
    const r = JSON.parse(L(root, 'search', 'PYTHON', 'stub', '--json').out[0]);
    assert.deepEqual(r.lessons.map((l) => l.id), ['L-0002']);
    const none = L(root, 'search', 'python', 'rust');
    assert.equal(none.code, 0);
    assert.match(none.out.join('\n'), /No lessons match/);
    assert.equal(L(root, 'search').code, 2);
  });
  test('missing ledger is not an error for read commands', () => {
    const root = freshRoot();
    assert.equal(L(root, 'list').code, 0);
    assert.equal(L(root, 'stats').code, 0);
    assert.equal(L(root, 'promote-candidates').code, 0);
    assert.equal(fs.existsSync(path.join(root, LEDGER_REL)), false);
  });
});

describe('lessons vote / retire', () => {
  test('vote increments counters in place', () => {
    const root = freshRoot(SEEDED);
    assert.equal(L(root, 'vote', 'L-0004', 'helpful').code, 0);
    assert.equal(L(root, 'vote', '4', 'helpful').code, 0);
    const r = L(root, 'vote', 'l-4', 'harmful');
    assert.equal(r.code, 0);
    assert.match(r.out[0], /\+2 -1/);
    const led = parseLedger(ledgerText(root));
    const l4 = led.lessons.find((l) => l.num === 4);
    assert.equal(l4.helpful, 2);
    assert.equal(l4.harmful, 1);
    assert.equal(l4.lineIndex, parseLedger(SEEDED).lessons.find((l) => l.num === 4).lineIndex);
  });
  test('vote errors: unknown id exit 1, bad kind or id exit 2', () => {
    const root = freshRoot(SEEDED);
    assert.equal(L(root, 'vote', 'L-0099', 'helpful').code, 1);
    assert.equal(L(root, 'vote', 'L-0001', 'great').code, 2);
    assert.equal(L(root, 'vote', 'nope', 'helpful').code, 2);
    assert.equal(L(freshRoot(), 'vote', 'L-0001', 'helpful').code, 1);
    assert.equal(ledgerText(root), SEEDED);
  });
  test('retire moves a lesson to Retired with a note', () => {
    const root = freshRoot(SEEDED);
    const r = L(root, 'retire', 'L-0003', '--reason', 'superseded by L-0009', '--date', '2026-09-25');
    assert.equal(r.code, 0, r.err.join('\n'));
    const led = parseLedger(ledgerText(root));
    const l3 = led.lessons.find((l) => l.num === 3);
    assert.equal(l3.status, 'retired');
    assert.match(l3.evidence, /retired 2026-09-25: superseded by L-0009/);
    assert.equal(L(root, 'retire', 'L-0003').code, 1);
    const text = ledgerText(root);
    assert.ok(text.indexOf('[L-0003]') > text.indexOf('## Retired'));
  });
});

describe('lessons stats / promote-candidates', () => {
  test('promote-candidates: helpful >= 2, harmful 0, not already in 90-lessons', () => {
    const root = freshRoot(SEEDED, '---\ntrigger: always_on\ndescription: "Curated lessons."\n---\n- invoke_subagent is async (L-0001)\n');
    const r = JSON.parse(L(root, 'promote-candidates', '--json').out[0]);
    assert.deepEqual(r.candidates.map((l) => l.id), ['L-0002']);
    assert.equal(r.curated.exists, true);
    assert.equal(r.curated.cap, 4500);
    const txt = L(root, 'promote-candidates').out.join('\n');
    assert.match(txt, /Promote candidates .*: 1/);
    assert.match(txt, /bytes used/);
  });
  test('stats summarises counts, votes, scopes and candidates', () => {
    const root = freshRoot(SEEDED + '- [L-0005] broken line\n', '');
    const s = JSON.parse(L(root, 'stats', '--json').out[0]);
    assert.equal(s.active, 4);
    assert.equal(s.retired, 1);
    assert.equal(s.malformed, 1);
    assert.equal(s.helpful, 7);
    assert.equal(s.harmful, 1);
    assert.deepEqual(s.scopes, { platform: 1, tooling: 2, rust: 1 });
    assert.deepEqual(s.candidates, ['L-0001', 'L-0002']);
    assert.equal(s.neverVoted, 1);
    const txt = L(root, 'stats').out.join('\n');
    assert.match(txt, /Lessons: 4 active, 1 retired, 1 malformed/);
    assert.match(txt, /WARN malformed line/);
  });
});

describe('lessons CLI', () => {
  const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 30000 });
  test('--help exits 0; no command / unknown command / unknown option exit 2', () => {
    const h = cli('--help');
    assert.equal(h.status, 0);
    assert.match(h.stdout, /promote-candidates/);
    assert.equal(cli().status, 2);
    assert.equal(cli('frobnicate').status, 2);
    assert.equal(cli('list', '--nope').status, 2);
  });
  test('end-to-end via the real process with --root', () => {
    const root = freshRoot();
    const a = cli('add', '--root', root, '--scope', 'e2e', '--text', 'spawned add works because argv parsing is right');
    assert.equal(a.status, 0, a.stderr);
    assert.match(a.stdout, /Added L-0001/);
    const v = cli('vote', 'L-0001', 'helpful', '--root', root);
    assert.equal(v.status, 0, v.stderr);
    const s = cli('search', 'argv', '--root', root);
    assert.match(s.stdout, /\[L-0001\] scope:e2e \| \+1 -0/);
  });
});
