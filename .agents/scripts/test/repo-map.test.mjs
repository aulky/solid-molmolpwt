// node --test .agents/scripts/test/repo-map.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '..', 'repo-map.mjs');
const TMP_BASE = process.env.KIT_TEST_TMPDIR || os.tmpdir();
let tmp;
let fx;

function run(args, cwd = tmp) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', windowsHide: true });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function write(rel, content) {
  const abs = path.join(fx, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

before(() => {
  fs.mkdirSync(TMP_BASE, { recursive: true });
  tmp = fs.mkdtempSync(path.join(TMP_BASE, 'repo-map-test-'));
  fx = path.join(tmp, 'repo');
  write('.agents/rules/00-core.md', '---\ntrigger: always_on\n---\n');
  write('.agents/skills/x/SKILL.md', '---\nname: x\n---\n');
  write('package.json', JSON.stringify({
    name: 'fx-app', type: 'module', scripts: { dev: 'vite dev', test: 'vitest run' }, engines: { node: '>=24' },
    dependencies: { 'solid-js': '^1.9.0', '@solidjs/start': '^2.0.0' }, devDependencies: { tailwindcss: '^4.0.0', vitest: '^4.0.0' },
  }, null, 2));
  write('bun.lock', '{}\n');
  write('pnpm-lock.yaml', 'lockfileVersion: 9\n');
  write('tsconfig.json', '{\n  // comment\n  "compilerOptions": { "strict": true, "jsx": "preserve", "jsxImportSource": "solid-js", "paths": { "~/*": ["./src/*"] }, },\n}\n');
  write('vite.config.ts', 'export default defineConfig({\n  plugins: [solidStart(), tailwindcss()],\n});\n');
  write('vitest.config.ts', 'export default {};\n');
  write('src/app.tsx', 'export default function App() {}\n');
  write('src/app.css', '@import "tailwindcss";\n');
  write('src/entry-server.tsx', '// server\n');
  write('src/routes/index.tsx', '// route\n');
  write('src/lib/x.test.ts', '// test\n');
  write('e2e/home.spec.ts', '// e2e\n');
  write('node_modules/foo/package.json', '{"name":"foo"}');
  write('api/Cargo.toml', '[package]\nname = "api"\n\n[dependencies]\naxum = "0.8"\ntokio = { version = "1" }\n');
  write('api/src/main.rs', 'fn main() {}\n');
  write('svc/go.mod', 'module example.com/svc\n\ngo 1.26\n\nrequire github.com/go-chi/chi/v5 v5.0.0\n');
  write('svc/main.go', 'package main\n');
  write('py/pyproject.toml', '[project]\nname = "pyapp"\ndependencies = ["fastapi>=0.1"]\n\n[project.scripts]\nserve = "pyapp.main:run"\n');
  write('py/uv.lock', 'version = 1\n');
  write('py/tests/test_api.py', 'def test_x(): pass\n');
  write('Makefile', 'build:\n\techo build\ntest: build\n\techo test\nX := 1\n');
  write('.env', 'SECRET_VALUE=shh-do-not-read\n');
  write('deep/a/b/c/package.json', '{"name":"too-deep"}');
});

after(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test('--help exits 0; bad arguments exit 2', () => {
  const h = run(['--help']);
  assert.equal(h.code, 0);
  assert.match(h.out, /Usage: node \.agents\/scripts\/repo-map\.mjs/);
  assert.equal(run(['--bogus']).code, 2);
  assert.equal(run(['--depth', 'x']).code, 2);
  assert.equal(run(['--root', path.join(tmp, 'missing')]).code, 2);
});

test('--json: roots, stacks, package manager, frameworks, scripts', () => {
  const r = run(['--json', '--root', fx]);
  assert.equal(r.code, 0, r.err);
  const m = JSON.parse(r.out);
  assert.deepEqual(m.roots.map((x) => x.path), ['.', 'api', 'py', 'svc']);
  const top = m.roots[0];
  assert.equal(m.packageManager, 'bun');
  assert.equal(top.name, 'fx-app');
  assert.ok(top.stacks.includes('node') && top.stacks.includes('bun'));
  for (const id of ['solidjs', 'solid-start', 'tailwind']) assert.ok(top.fw.includes(id), id);
  assert.equal(top.scripts.dev, 'vite dev');
  assert.ok('make build' in top.scripts && 'make test' in top.scripts && !('make X' in top.scripts));
  assert.ok(m.warnings.some((w) => /multiple lockfiles/.test(w)));
  const api = m.roots.find((x) => x.path === 'api');
  assert.deepEqual([api.stacks, api.name, api.fw], [['rust'], 'api', ['rust-web']]);
  const svc = m.roots.find((x) => x.path === 'svc');
  assert.deepEqual([svc.stacks, svc.name, svc.fw], [['go'], 'example.com/svc', ['go-web']]);
  const py = m.roots.find((x) => x.path === 'py');
  assert.deepEqual([py.packageManager, py.fw, py.scripts.serve], ['uv', ['fastapi'], 'pyapp.main:run']);
});

test('--json: entry points, tests, config notes, tree; never reads .env', () => {
  const r = run(['--json', '--root', fx]);
  const m = JSON.parse(r.out);
  for (const e of ['src/app.tsx', 'src/entry-server.tsx', 'api/src/main.rs', 'svc/main.go']) assert.ok(m.entryPoints.includes(e), e);
  assert.ok(!m.entryPoints.includes('src/app.css'));
  assert.deepEqual(m.routeDirs, [{ path: 'src/routes', files: 1 }]);
  const loc = Object.fromEntries(m.tests.locations.map((t) => [t.path, t.files]));
  assert.deepEqual([loc.e2e, loc['src/lib'], loc['py/tests']], [1, 1, 1]);
  assert.ok(m.tests.configs.includes('vitest.config.ts'));
  const ts = m.config.find((c) => c.path === 'tsconfig.json');
  assert.match(ts.note, /strict/);
  assert.match(ts.note, /jsxImportSource solid-js/);
  assert.match(m.config.find((c) => c.path === 'vite.config.ts').note, /plugins: solidStart, tailwindcss/);
  assert.match(m.config.find((c) => c.path === '.env').note, /not read/);
  assert.ok(!r.out.includes('shh-do-not-read'));
  const src = m.tree.find((n) => n.path === 'src');
  assert.equal(src.files, 5);
  assert.ok(!m.tree.some((n) => n.path === 'node_modules'));
  assert.ok(m.ignoredTop.includes('node_modules/'));
  assert.deepEqual(m.kit && [m.kit.rules, m.kit.skills], [1, 1]);
});

test('writes .agents/.state/repo-map.json and prints a text summary', () => {
  const r = run(['--root', fx]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^# Repo map: repo/);
  assert.match(r.out, /## Projects/);
  assert.match(r.out, /## Tree \(depth 3/);
  assert.match(r.out, /written: \.agents\/\.state\/repo-map\.json/);
  const state = JSON.parse(fs.readFileSync(path.join(fx, '.agents/.state/repo-map.json'), 'utf8'));
  assert.equal(state.v, 1);
  assert.equal(state.packageManager, 'bun');
});

test('--depth limits the tree and root detection', () => {
  const m = JSON.parse(run(['--json', '--depth', '1', '--root', fx]).out);
  assert.ok(m.tree.every((n) => n.children.length === 0));
  assert.deepEqual(m.roots.map((x) => x.path), ['.', 'api', 'py', 'svc']);
  const m4 = JSON.parse(run(['--json', '--depth', '4', '--root', fx]).out);
  assert.ok(m4.roots.some((x) => x.path === 'deep/a/b/c'));
});

test('a folder without .agents/ is mapped but no state is written', () => {
  const bare = path.join(tmp, 'bare');
  fs.mkdirSync(path.join(bare, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(bare, 'lib', 'x.py'), 'print(1)\n');
  const r = run(['--root', bare]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /state not written/);
  assert.ok(!fs.existsSync(path.join(bare, '.agents')));
});
