// node --test suite for activate-stack.mjs: framework detection and byte-exact trigger flipping in
// fixture .agents/rules/fw-*.md files (temp dirs with spaces in their names).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTrigger } from '../activate-stack.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '..', 'activate-stack.mjs');

const tmpDirs = [];
after(() => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });

function mkTmp(label) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `fk ${label} `));
  tmpDirs.push(d);
  return d;
}

function write(root, rel, content) {
  const p = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

function activate(root, args = []) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { env, encoding: 'utf8', timeout: 60000 });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

const rule = (trigger, globs, eol = '\n', extra = '') => [
  '---', `trigger: ${trigger}`, `globs: "${globs}"`, 'description: "Pack. Applies when the manifest says so."', '---',
  '# Pack — quick card', 'Applies only if package.json lists the dependency. Otherwise ignore this rule.',
  'Example text that mentions trigger: glob inside the body must never change.', `Unicode stays: café — ✓${extra}`, '',
].join(eol);

const ORIGINAL = {
  'fw-solidjs.md': rule('model_decision', '**/*.tsx,**/*.jsx'),
  'fw-react.md': rule('glob', '**/*.tsx,**/*.jsx', '\r\n'),
  'fw-tailwind.md': rule('"model_decision"', '**/*.css,**/tailwind.config.*'),
  'fw-laravel.md': `﻿${rule('model_decision', '**/*.php')}`,
  'fw-remotion.md': rule('glob   # pinned by the user', '**/Root.tsx'),
  'fw-broken.md': '# no frontmatter here\ntrigger: glob\n',
  'lang-typescript.md': rule('glob', '**/*.ts'),
  'topic-testing.md': rule('model_decision', '**/*.test.*'),
};

function fixture(label, pkg) {
  const root = mkTmp(label);
  write(root, 'package.json', JSON.stringify(pkg));
  write(root, 'bun.lock', '');
  for (const [f, c] of Object.entries(ORIGINAL)) write(root, `.agents/rules/${f}`, c);
  return root;
}

const read = (root, f) => fs.readFileSync(path.join(root, '.agents', 'rules', f));
/** Expected bytes: the original with exactly one frontmatter trigger line replaced. */
const expectFlip = (f, from, to) => Buffer.from(ORIGINAL[f].replace(`trigger: ${from}`, `trigger: ${to}`), 'utf8');

test('flips detected packs to glob and the rest to model_decision, byte-exact, then back again', () => {
  const root = fixture('flip', { dependencies: { 'solid-js': '^1.9.0' }, devDependencies: { tailwindcss: '^4.0.0' } });
  const r = activate(root);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(read(root, 'fw-solidjs.md'), expectFlip('fw-solidjs.md', 'model_decision', 'glob'));
  assert.deepEqual(read(root, 'fw-react.md'), expectFlip('fw-react.md', 'glob', 'model_decision'), 'CRLF kept, react not detected with solid-js');
  assert.deepEqual(read(root, 'fw-tailwind.md'), expectFlip('fw-tailwind.md', '"model_decision"', '"glob"'), 'quote style kept');
  assert.deepEqual(read(root, 'fw-laravel.md'), Buffer.from(ORIGINAL['fw-laravel.md']), 'already model_decision: untouched (BOM kept)');
  assert.deepEqual(read(root, 'fw-remotion.md'), Buffer.from(ORIGINAL['fw-remotion.md']), 'pinned trigger untouched');
  assert.deepEqual(read(root, 'fw-broken.md'), Buffer.from(ORIGINAL['fw-broken.md']), 'no frontmatter: untouched');
  assert.deepEqual(read(root, 'lang-typescript.md'), Buffer.from(ORIGINAL['lang-typescript.md']), 'non-fw rules untouched');
  assert.deepEqual(read(root, 'topic-testing.md'), Buffer.from(ORIGINAL['topic-testing.md']));
  assert.match(r.stdout, /^fw-solidjs\.md: model_decision -> glob$/m);
  assert.match(r.stdout, /^fw-react\.md: glob -> model_decision$/m);
  assert.match(r.stdout, /^warning: fw-broken\.md: no YAML frontmatter/m);

  const state = JSON.parse(fs.readFileSync(path.join(root, '.agents', '.state', 'stack.json'), 'utf8'));
  assert.equal(state.packageManager, 'bun');
  assert.deepEqual(state.frameworks, ['solidjs', 'tailwind']);
  assert.ok(state.stacks.includes('node'));
  assert.equal(typeof state.ts, 'number');

  // Switch the project to React: both flips must reverse, restoring solidjs to its exact original bytes.
  write(root, 'package.json', JSON.stringify({ dependencies: { react: '^19.0.0' } }));
  const r2 = activate(root);
  assert.equal(r2.code, 0, r2.stderr);
  assert.deepEqual(read(root, 'fw-solidjs.md'), Buffer.from(ORIGINAL['fw-solidjs.md']));
  assert.deepEqual(read(root, 'fw-react.md'), Buffer.from(ORIGINAL['fw-react.md']));
  assert.deepEqual(read(root, 'fw-tailwind.md'), Buffer.from(ORIGINAL['fw-tailwind.md']));
  const left = fs.readdirSync(path.join(root, '.agents', 'rules')).filter((f) => f.endsWith('.tmp'));
  assert.deepEqual(left, [], 'no temp files left behind');
});

test('--dry-run reports changes but writes nothing; --json is parseable', () => {
  const root = fixture('dry', { dependencies: { 'solid-js': '1' } });
  const r = activate(root, ['--dry-run', '--json']);
  assert.equal(r.code, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.dryRun, true);
  assert.deepEqual(j.rules.find((x) => x.file === 'fw-solidjs.md'), { file: 'fw-solidjs.md', id: 'solidjs', want: 'glob', from: 'model_decision', to: 'glob', changed: true });
  assert.deepEqual(read(root, 'fw-solidjs.md'), Buffer.from(ORIGINAL['fw-solidjs.md']));
  assert.ok(!fs.existsSync(path.join(root, '.agents', '.state', 'stack.json')));
});

test('detects frameworks from every manifest type', () => {
  const root = mkTmp('fw');
  const files = {
    'web/package.json': JSON.stringify({ dependencies: { next: '15', react: '19', express: '5', '@remotion/player': '4' } }),
    'api/composer.json': JSON.stringify({ require: { 'laravel/framework': '^12.0' } }),
    'rs/Cargo.toml': '[package]\nname = "x"\n\n[dependencies]\naxum = "0.8"\n',
    'gosvc/go.mod': 'module x\n\nrequire github.com/gin-gonic/gin v1.10.0\n',
    'py/pyproject.toml': '[project]\ndependencies = ["Django>=5", "djangorestframework"]\n',
    'fa/requirements.txt': 'fastapi==0.115\nuvicorn\n',
    'rb/Gemfile': "source 'https://rubygems.org'\ngem 'rails', '~> 8.0'\n",
    'ex/mix.exs': 'defp deps do\n  [{:phoenix, "~> 1.7"}]\nend\n',
    'app/pubspec.yaml': 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n',
    'svc/pom.xml': '<project><parent><artifactId>spring-boot-starter-parent</artifactId></parent></project>',
    'cs/Web.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>',
    'mob/package.json': JSON.stringify({ dependencies: { expo: '52', 'react-native': '0.76' } }),
  };
  for (const [rel, c] of Object.entries(files)) write(root, rel, c);
  const j = JSON.parse(activate(root, ['--dry-run', '--json']).stdout);
  assert.deepEqual(j.frameworks, [
    'react', 'nextjs', 'node-server', 'react-native', 'flutter', 'django', 'fastapi', 'laravel', 'spring-boot',
    'aspnet-core', 'rails', 'phoenix', 'rust-web', 'go-web', 'remotion',
  ]);
  assert.deepEqual(j.evidence.django, ['py/pyproject.toml: django']);
  assert.match(j.warnings.join('\n'), /no \.agents\/rules directory/);
});

test('go-web falls back to scanning .go sources for net/http', () => {
  const root = mkTmp('goweb');
  write(root, 'go.mod', 'module x\n');
  write(root, 'cmd/server/main.go', 'package main\n\nimport "net/http"\n');
  const j = JSON.parse(activate(root, ['--dry-run', '--json']).stdout);
  assert.deepEqual(j.frameworks, ['go-web']);
});

test('setTrigger preserves every other byte, including invalid UTF-8', () => {
  const buf = Buffer.concat([Buffer.from('---\r\ntrigger: glob\r\nglobs: "**/*.rs"\r\n---\r\n'), Buffer.from([0xff, 0xfe, 0x0a])]);
  const res = setTrigger(buf, 'model_decision');
  assert.equal(res.changed, true);
  assert.deepEqual(res.buffer, Buffer.concat([Buffer.from('---\r\ntrigger: model_decision\r\nglobs: "**/*.rs"\r\n---\r\n'), Buffer.from([0xff, 0xfe, 0x0a])]));
  assert.equal(setTrigger(Buffer.from('---\nname: x\n---\n'), 'glob').error, 'no top-level "trigger:" line in frontmatter');
});

test('--help exits 0 and unknown options exit 2', () => {
  const root = mkTmp('usage');
  assert.equal(activate(root, ['--help']).code, 0);
  assert.equal(activate(root, ['--nope']).code, 2);
});
