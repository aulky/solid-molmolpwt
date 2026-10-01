// Tests for .agents/skills/start/scripts/detect.mjs. Run: node --test .agents/scripts/test/start-detect.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { survey, agentsMdState, projectEntries } from '../../skills/start/scripts/detect.mjs';

const DETECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'start', 'scripts', 'detect.mjs');
const TEMPLATE = '# Project facts\n\n> Template from the Frontier Kit. Run `/start` to fill it in.\n\n## Stack\n- Languages / frameworks: <fill in, e.g. PHP 8.3>\n';
const FILLED = '# Project facts: shop\n\n## Stack\n- SolidJS 1.9\n\n## Commands\n- Test: `bun run test`\n';
const LESSONS = '# Lessons ledger\n\n## Active\n'
  + '- [L-0001] scope:platform | +0 -0 | 2026-09-24 | platform fact | evidence: x\n'
  + '- [L-0002] scope:tooling | +0 -0 | 2026-09-24 | Run python not python3 | evidence: y\n\n'
  + '## Retired\n- [L-0004] scope:tooling | +0 -0 | 2026-09-24 | retired tool fact | evidence: z\n';
let tmp;

function workspace(name, files) {
  const root = path.join(tmp, name);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (content !== null) fs.writeFileSync(abs, content);
  }
  return root;
}
const kit = (extra = {}) => ({
  '.agents/GEMINI.md': '# Frontier Kit index\n',
  '.agents/memory/lessons.md': LESSONS,
  'AGENTS.md': TEMPLATE,
  'README.md': '# Antigravity Frontier Kit\n\nkit readme\n',
  '.gitignore': '.agents/.state/\n',
  'skills-lock.json': '{}\n',
  ...extra,
});

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'start-detect-test-'));
});
after(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test('a cloned kit with no project files is mode new', () => {
  const s = survey(workspace('new', kit()));
  assert.equal(s.mode, 'new');
  assert.deepEqual(s.entries, []);
  assert.equal(s.agentsMd, 'template');
  assert.match(s.next, /new-project in place/);
  assert.deepEqual(s.machineLessons.map((l) => l.id), ['L-0002']); // platform and retired lessons excluded
});

test('project files with a template AGENTS.md are mode existing, with stack facts', () => {
  const root = workspace('existing', kit({
    'package.json': JSON.stringify({ name: 'shop', dependencies: { 'solid-js': '^1.9.0' }, devDependencies: { '@playwright/test': '^1.50.0' } }),
    'bun.lock': '{}\n',
    'playwright.config.ts': 'export default {};\n',
    'src/app.tsx': 'export default () => null;\n',
  }));
  const s = survey(root);
  assert.equal(s.mode, 'existing');
  assert.deepEqual(s.entries, ['bun.lock', 'package.json', 'playwright.config.ts', 'src']);
  assert.ok(s.stacks.includes('node'), s.stacks.join());
  assert.equal(s.packageManager, 'bun');
  assert.ok(s.frameworks.includes('solidjs'), s.frameworks.join());
  assert.deepEqual(s.e2e, { config: 'playwright.config.ts', dependency: true, ui: true });
  assert.match(s.next, /onboard-repo from step 2/);
});

test('a filled AGENTS.md makes it mode onboarded; a missing one stays existing', () => {
  assert.equal(survey(workspace('onboarded', kit({ 'AGENTS.md': FILLED, 'main.go': 'package main\n' }))).mode, 'onboarded');
  const missing = workspace('missing', kit({ 'AGENTS.md': null, 'main.go': 'package main\n' }));
  fs.rmSync(path.join(missing, 'AGENTS.md'), { force: true });
  assert.equal(agentsMdState(missing), 'missing');
  assert.equal(survey(missing).mode, 'existing');
});

test('only the kit README counts as a kit file; a project README is a project entry', () => {
  const root = workspace('readme', kit({ 'README.md': '# My App\n' }));
  assert.deepEqual(projectEntries(root), ['README.md']);
  assert.equal(survey(root).mode, 'existing');
});

test('CLI prints the START-DETECT block and JSON; bad arguments exit 2', () => {
  const root = workspace('cli', kit());
  let r = spawnSync(process.execPath, [DETECT, '--root', root], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^START-DETECT\nmode: new\n/);
  assert.match(r.stdout, /\ncommit-msg hook: /);
  r = spawnSync(process.execPath, [DETECT, '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(r.stdout).mode, 'new');
  r = spawnSync(process.execPath, [DETECT, '--bogus'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});
