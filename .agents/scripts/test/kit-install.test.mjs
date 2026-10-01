// node --test .agents/scripts/test/kit-install.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '..', 'kit-install.mjs');
const TMP_BASE = process.env.KIT_TEST_TMPDIR || os.tmpdir();
let tmp;
let srcKit;

function run(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: tmp, encoding: 'utf8', windowsHide: true });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const install = (target, ...extra) => run(['--source', srcKit, '--target', target, ...extra]);

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (root, rel) => fs.existsSync(path.join(root, rel));

const ACTIVATE = `import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
fs.mkdirSync(path.join(root, '.agents/.state'), { recursive: true });
fs.writeFileSync(path.join(root, '.agents/.state/activated.json'), JSON.stringify({ cwd: root }));
const f = path.join(root, '.agents/rules/fw-react.md');
fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^trigger:.*$/m, 'trigger: glob'));
console.log('activated 1 framework pack');
`;

function makeTarget(name, gitignore) {
  const t = path.join(tmp, name);
  fs.mkdirSync(t, { recursive: true });
  if (gitignore !== undefined) fs.writeFileSync(path.join(t, '.gitignore'), gitignore);
  fs.writeFileSync(path.join(t, 'README.md'), '# target\n');
  return t;
}

before(() => {
  fs.mkdirSync(TMP_BASE, { recursive: true });
  tmp = fs.mkdtempSync(path.join(TMP_BASE, 'kit-install-test-'));
  const repo = path.join(tmp, 'source');
  srcKit = path.join(repo, '.agents');
  write(srcKit, 'rules/00-core-protocol.md', '---\ntrigger: always_on\ndescription: "core"\n---\n# Core\n');
  write(srcKit, 'rules/fw-react.md', '---\ntrigger: model_decision\nglobs: "**/*.tsx"\ndescription: "react"\n---\n# React\n');
  write(srcKit, 'rules/90-lessons.md', '---\ntrigger: always_on\ndescription: "Curated lessons."\n---\n# Curated lessons\n\nIntro line.\n\n## Platform\n- a platform lesson (L-0001)\n\n## Project\n- a project lesson (L-0005)\n\n---\nHardest: (L-0001)\n');
  write(srcKit, 'rules/sub/nested.md', '---\ntrigger: always_on\n---\n');
  write(srcKit, 'guides/languages/go.md', '# Go guide\n');
  write(srcKit, 'skills/orchestrate/SKILL.md', '---\nname: orchestrate\n---\n');
  write(srcKit, 'skills/orchestrate/references/r.md', 'ref\n');
  write(srcKit, 'skills/feature/SKILL.md', '---\nname: feature\n---\n'); // deleted in v2: no longer a kit skill
  write(srcKit, 'skills/remotion-best-practices/SKILL.md', '---\nname: remotion-best-practices\n---\n'); // removed third-party
  write(srcKit, 'skills/seo-audit/SKILL.md', '---\nname: seo-audit\n---\n');
  write(srcKit, 'skills/_drafts/x/SKILL.md', '---\nname: x\n---\n');
  write(srcKit, 'skills/custom-thing/SKILL.md', '---\nname: custom-thing\n---\n');
  write(srcKit, 'agents/reviewer.md', '---\nname: reviewer\n---\n');
  write(srcKit, 'agents/implementer/agent.md', '---\nname: implementer\n---\n');
  write(srcKit, 'hooks.json', '{}\n');
  write(srcKit, 'hooks/lib.mjs', 'export {};\n');
  write(srcKit, 'hooks/test/hooks.test.mjs', '// test\n');
  write(srcKit, 'scripts/activate-stack.mjs', ACTIVATE);
  write(srcKit, 'scripts/lib/walk.mjs', 'export {};\n');
  write(srcKit, 'docs/antigravity-spec.md', '# spec\n');
  write(srcKit, 'GEMINI.md', '# Kit index\n');
  write(srcKit, 'README.md', '# Kit readme\n');
  write(srcKit, 'memory/lessons.md', '# Lessons ledger\n\nHeader line.\n- Line format: `- [L-NNNN] scope:<scope> | ...`\n- Seeds L-0001..L-0007 were verified here.\n\n## Active\n- [L-0001] scope:platform | +0 -0 | 2026-09-24 | secret-ish project lesson | evidence: x\n\n## Retired\n');
  write(srcKit, '.state/conv-1.json', '{"private": true}\n');
});

after(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test('--help exits 0; usage errors exit 2', () => {
  assert.equal(run(['--help']).code, 0);
  assert.equal(run([]).code, 2);
  assert.equal(install(path.join(tmp, 'nope')).code, 2);
  assert.equal(install(path.dirname(srcKit)).code, 2); // target is the source repo
  assert.equal(run(['--target', tmp, '--bogus']).code, 2);
});

test('--dry-run prints the plan and writes nothing', () => {
  const t = makeTarget('dry', 'node_modules\n');
  const r = install(t, '--dry-run');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /CREATE {4}\.agents\/rules\/00-core-protocol\.md/);
  assert.match(r.out, /KIT-INSTALL: DRY RUN/);
  assert.match(r.out, /would run `node \.agents\/scripts\/activate-stack\.mjs`/);
  assert.ok(!exists(t, '.agents'));
  assert.ok(!exists(t, 'AGENTS.md'));
  assert.equal(read(t, '.gitignore'), 'node_modules\n');
});

test('install copies the kit, creates skeletons and AGENTS.md, appends .gitignore, runs activate-stack', () => {
  const t = makeTarget('full', 'node_modules\n.agents/.state\n');
  const r = install(t);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /KIT-INSTALL: OK/);
  for (const rel of ['.agents/rules/00-core-protocol.md', '.agents/rules/fw-react.md', '.agents/guides/languages/go.md',
    '.agents/skills/orchestrate/SKILL.md', '.agents/skills/orchestrate/references/r.md', '.agents/agents/reviewer.md',
    '.agents/agents/implementer/agent.md',
    '.agents/hooks.json', '.agents/hooks/lib.mjs', '.agents/hooks/test/hooks.test.mjs', '.agents/scripts/lib/walk.mjs',
    '.agents/docs/antigravity-spec.md', '.agents/GEMINI.md', '.agents/README.md', '.agents/skills/seo-audit/SKILL.md']) {
    assert.ok(exists(t, rel), rel);
  }
  for (const rel of ['.agents/rules/sub/nested.md', '.agents/skills/_drafts',
    '.agents/skills/custom-thing', '.agents/skills/feature', '.agents/skills/remotion-best-practices',
    '.agents/.state/conv-1.json']) {
    assert.ok(!exists(t, rel), rel);
  }
  const curated = read(t, '.agents/rules/90-lessons.md');
  assert.match(curated, /^---\ntrigger: always_on\ndescription: "Curated lessons\."\n---\n/);
  assert.match(curated, /## Platform\n- None recorded yet\./);
  assert.ok(!/L-\d{4}/.test(curated), curated);
  const ledger = read(t, '.agents/memory/lessons.md');
  assert.match(ledger, /^# Lessons ledger/);
  assert.match(ledger, /## Active\n\n## Retired\n$/);
  assert.ok(!/L-\d{4}/.test(ledger) && ledger.includes('L-NNNN'), ledger);
  assert.match(read(t, 'AGENTS.md'), /^# Project facts/);
  const gi = read(t, '.gitignore');
  assert.equal(gi.match(/\.agents\/\.state/g).length, 1, gi);
  assert.match(gi, /# Frontier Kit \(agent workspace\)\n\.scratch\/\n\/test-results\/\n/);
  const activated = JSON.parse(read(t, '.agents/.state/activated.json'));
  assert.equal(path.resolve(activated.cwd).toLowerCase(), path.resolve(t).toLowerCase());
  assert.match(r.out, /activate-stack: ok/);
  assert.match(r.out, /third-party skills copied[^\n]*seo-audit/);
  assert.ok(!exists(t, 'skills-lock.json')); // the fixture source has none
  assert.doesNotMatch(r.out, /third-party skills[^\n]*remotion/);
  assert.match(r.out, /not in the kit skill list\): custom-thing, feature, remotion-best-practices/);
  assert.match(r.out, /kit skills missing in the source \(skipped\): verify, write-tests, e2e-test, research-docs, security-audit, reflect, capture-skill, perf-audit, db-migration, upgrade-deps, commit-and-pr, onboard-repo, new-project, workspace-doctor, start\n/);
  assert.doesNotMatch(r.out, /kit skills missing[^\n]*orchestrate/);
  // agents/ is copied whole; the roster check only reports gaps (flat <name>.md and <name>/agent.md both count).
  const agentNote = r.out.match(/kit agents missing in the source: ([^\n]*)/);
  assert.ok(agentNote, r.out);
  const missingAgents = agentNote[1].split(', ');
  for (const n of ['orchestrator', 'fixer', 'e2e-tester', 'scribe']) assert.ok(missingAgents.includes(n), n);
  for (const n of ['reviewer', 'implementer']) assert.ok(!missingAgents.includes(n), n);
  assert.equal(missingAgents.length, 12);
});

test('re-running is idempotent (framework trigger flips are not conflicts)', () => {
  const t = makeTarget('rerun', '');
  assert.equal(install(t).code, 0);
  assert.match(read(t, '.agents/rules/fw-react.md'), /^trigger: glob$/m);
  const gi1 = read(t, '.gitignore');
  const r = install(t);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /KIT-INSTALL: OK \(create 0, overwrite 0, conflict 0/);
  assert.equal(read(t, '.gitignore'), gi1);
  assert.match(r.out, /\.gitignore: entries already present/);
});

test('changed kit files are conflicts without --force; project-owned files are never overwritten', () => {
  const t = makeTarget('conflict', 'x\r\n');
  assert.equal(install(t).code, 0);
  assert.match(read(t, '.gitignore'), /^x\r\n\r\n# Frontier Kit \(agent workspace\)\r\n/);
  fs.writeFileSync(path.join(t, '.agents/rules/00-core-protocol.md'), 'local edit\n');
  fs.writeFileSync(path.join(t, 'AGENTS.md'), '# my facts\n');
  fs.appendFileSync(path.join(t, '.agents/memory/lessons.md'), '- [L-0001] scope:project | +2 -0 | 2026-09-25 | keep me | evidence: y\n');
  const r = install(t);
  assert.equal(r.code, 1);
  assert.match(r.out, /CONFLICT {2}\.agents\/rules\/00-core-protocol\.md/);
  assert.match(r.out, /KIT-INSTALL: INCOMPLETE/);
  assert.equal(read(t, '.agents/rules/00-core-protocol.md'), 'local edit\n');
  const f = install(t, '--force');
  assert.equal(f.code, 0, f.out);
  assert.match(f.out, /OVERWRITE {1}\.agents\/rules\/00-core-protocol\.md/);
  assert.match(read(t, '.agents/rules/00-core-protocol.md'), /# Core/);
  assert.equal(read(t, 'AGENTS.md'), '# my facts\n');
  assert.match(read(t, '.agents/memory/lessons.md'), /keep me/);
  assert.match(f.out, /KEEP {6}AGENTS\.md/);
});

test('the real kit can plan an install (dry run)', () => {
  const t = makeTarget('real', undefined);
  const r = run(['--target', t, '--dry-run']);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /KIT-INSTALL: DRY RUN/);
  assert.ok(!exists(t, '.agents'));
  // The real kit ships every v2 kit skill and agent, so there are no gap notes.
  assert.doesNotMatch(r.out, /kit skills missing|kit agents missing/, r.out);
  // A name dropped from KIT_SKILLS would show up here instead of being copied.
  assert.doesNotMatch(r.out, /not in the kit skill list/, r.out);
  assert.match(r.out, /third-party skills copied \(do not edit; sources in skills-lock\.json\): architecture-decision-records, commit-archaeologist, seo-audit, thinking-out-loud, vercel-react-best-practices\r?\n/);
  for (const n of ['orchestrate', 'verify', 'write-tests', 'e2e-test', 'research-docs', 'security-audit', 'reflect',
    'capture-skill', 'perf-audit', 'db-migration', 'upgrade-deps', 'commit-and-pr', 'onboard-repo', 'new-project', 'start',
    'workspace-doctor']) {
    assert.ok(r.out.includes(`CREATE    .agents/skills/${n}/SKILL.md`), n);
  }
  assert.match(r.out, /CREATE {4}\.agents\/agents\/orchestrator\.md/);
  assert.match(r.out, /CREATE {4}\.agents\/skills\/seo-audit\/SKILL\.md/);
  assert.match(r.out, /CREATE {4}skills-lock\.json/);
});
