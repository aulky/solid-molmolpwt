// node --test suite for verify.mjs, lib/stacks.mjs and lib/proc.mjs. Hermetic: every fixture lives in
// os.tmpdir() under a directory name containing spaces; external tools are replaced by fake shims
// (.cmd on Windows, sh scripts elsewhere) that log their argv and exit as instructed.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findManifestDirs, projectRoots, detectPackageManager } from '../lib/stacks.mjs';
import { which, run, tailLines } from '../lib/proc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERIFY = path.resolve(HERE, '..', 'verify.mjs');
const IS_WIN = process.platform === 'win32';
const NODE_DIR = path.dirname(process.execPath);

const tmpDirs = [];
after(() => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });

function mkTmp(label) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `fk ${label} `));
  tmpDirs.push(d);
  return d;
}

function write(root, rel, content = '') {
  const p = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

/** Env with PATH replaced (case-insensitively) and test-runner/verify markers removed. */
function envWith(pathDirs, extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    const u = k.toUpperCase();
    if (u === 'PATH' || u === 'NODE_TEST_CONTEXT' || u === 'FRONTIER_VERIFY_ROOT') continue;
    env[k] = v;
  }
  env.PATH = pathDirs.join(path.delimiter);
  return Object.assign(env, extra);
}

const FAKE_TOOL = `import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const [name, ...args] = process.argv.slice(2);
if (process.env.FAKE_LOG) fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ name, args, cwd: process.cwd() }) + '\\n');
const rules = JSON.parse(process.env.FAKE_RULES || '{}');
const key = [name, ...args].join(' ');
for (const [prefix, r] of Object.entries(rules)) {
  if (key === prefix || key.startsWith(prefix + ' ')) {
    if (r.out) process.stdout.write(r.out + '\\n');
    process.exit(r.code ?? 0);
  }
}
if (['bun', 'npm', 'pnpm', 'yarn'].includes(name) && args[0] === 'run') {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  let rest = args.slice(2);
  if (rest[0] === '--') rest = rest.slice(1);
  const r = spawnSync([pkg.scripts[args[1]], ...rest].join(' '), { shell: true, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
process.exit(0);
`;

/** Create fake executables `names` in <root>/fake bin/ that run the logging fake tool. */
function fakeBin(root, names) {
  const bin = path.join(root, 'fake bin');
  fs.mkdirSync(bin, { recursive: true });
  const tool = path.join(root, 'fake-tool.mjs');
  fs.writeFileSync(tool, FAKE_TOOL);
  for (const n of names) {
    if (IS_WIN) {
      fs.writeFileSync(path.join(bin, `${n}.cmd`), `@"${process.execPath}" "${tool}" ${n} %*\r\n`);
    } else {
      const p = path.join(bin, n);
      fs.writeFileSync(p, `#!/bin/sh\nexec "${process.execPath}" "${tool}" ${n} "$@"\n`);
      fs.chmodSync(p, 0o755);
    }
  }
  return bin;
}

function readLog(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function verify(root, args, env) {
  const r = spawnSync(process.execPath, [VERIFY, '--root', root, ...args], {
    cwd: root, env, encoding: 'utf8', timeout: 120000, windowsHide: true,
  });
  const lines = (r.stdout || '').replace(/\r\n/g, '\n').trimEnd().split('\n');
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '', lines, last: lines[lines.length - 1] };
}

const samePath = (a, b) => {
  const n = (p) => { const r = fs.realpathSync.native(p); return IS_WIN ? r.toLowerCase() : r; };
  return n(a) === n(b);
};

// ------------------------------------------------------------------------------------------ detection

test('detects every stack from its manifest, honours depth, ignore dirs and ancestor builds', () => {
  const root = mkTmp('detect');
  const files = {
    'web/package.json': '{}', 'denoapp/deno.json': '{}', 'py/pyproject.toml': '[project]\nname="x"\n',
    'gosvc/go.mod': 'module x\n', 'rs/Cargo.toml': '[workspace]\nmembers=["crates/a"]\n', 'rs/crates/a/Cargo.toml': '[package]\n',
    'php/composer.json': '{}', 'rb/Gemfile': '', 'java/pom.xml': '<project/>', 'kt/build.gradle.kts': '',
    'cs/App.csproj': '<Project/>', 'dart/pubspec.yaml': 'name: x\n', 'ex/mix.exs': '', 'sw/Package.swift': '',
    'cpp/CMakeLists.txt': '', 'cpp/lib/CMakeLists.txt': '', 'a/b/c/package.json': '{}', 'a/b/c/d/package.json': '{}',
    'node_modules/pkg/package.json': '{}', 'dist/package.json': '{}', 'vendor/x/composer.json': '{}',
    '.agents/skills/s/package.json': '{}', 'testdata/go.mod': 'module t\n',
  };
  for (const [rel, c] of Object.entries(files)) write(root, rel, c);
  const dirs = findManifestDirs(root, 3);
  const byRel = Object.fromEntries(projectRoots(dirs).map((r) => [r.rel, r.stacks]));
  assert.deepEqual(byRel, {
    web: ['node'], denoapp: ['deno'], py: ['python'], gosvc: ['go'], rs: ['rust'], php: ['php'], rb: ['ruby'],
    java: ['jvm'], kt: ['jvm'], cs: ['dotnet'], dart: ['dart'], ex: ['elixir'], sw: ['swift'], cpp: ['cpp'],
    'a/b/c': ['node'],
  });
  assert.ok(dirs.some((d) => d.rel === 'rs/crates/a'), 'workspace member is found but deduped');
});

test('package manager comes from the nearest lockfile (bun > pnpm > yarn > npm), else packageManager, else npm', () => {
  const root = mkTmp('pm');
  const cases = [
    [['bun.lock'], 'bun'], [['bun.lockb'], 'bun'], [['pnpm-lock.yaml'], 'pnpm'], [['yarn.lock'], 'yarn'],
    [['package-lock.json'], 'npm'], [[], 'npm'], [['bun.lock', 'pnpm-lock.yaml'], 'bun'], [['pnpm-lock.yaml', 'yarn.lock'], 'pnpm'],
  ];
  cases.forEach(([locks, want], i) => {
    const d = path.join(root, `c${i}`);
    write(d, 'package.json', '{}');
    for (const l of locks) write(d, l, '');
    assert.equal(detectPackageManager(d, d).pm, want, `locks ${locks.join('+') || 'none'}`);
  });
  const mono = path.join(root, 'mono');
  write(mono, 'yarn.lock', '');
  write(mono, 'packages/app/package.json', '{}');
  assert.equal(detectPackageManager(path.join(mono, 'packages', 'app'), mono).pm, 'yarn', 'workspace member uses ancestor lockfile');
  const field = path.join(root, 'field');
  write(field, 'package.json', '{"packageManager":"pnpm@9.0.0"}');
  assert.equal(detectPackageManager(field, field).pm, 'pnpm');
});

// ------------------------------------------------------------------------------------------ proc

test('which() + run() handle shims in paths with spaces and pass tricky args through intact', async () => {
  const root = mkTmp('proc');
  const bin = fakeBin(root, ['cargo']);
  const env = envWith([bin, NODE_DIR], { FAKE_LOG: path.join(root, 'log.jsonl') });
  const exe = which('cargo', { env });
  assert.ok(exe, 'fake cargo resolved');
  if (IS_WIN) assert.match(exe, /cargo\.cmd$/i);
  const args = ['a b', '&x', '(y)', '100%', `${root}${path.sep}dir with space${path.sep}`];
  const r = await run(exe, args, { cwd: root, env, timeoutMs: 30000 });
  assert.equal(r.exit, 0, r.output);
  assert.deepEqual(readLog(path.join(root, 'log.jsonl'))[0].args, args);
  assert.equal(which('definitely-not-a-tool-xyz', { env }), null);
});

test('tailLines strips ANSI codes and keeps the last n lines', () => {
  const text = `${Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')}\n\x1b[31mred\x1b[0m\n`;
  const t = tailLines(text, 60);
  assert.equal(t.length, 60);
  assert.equal(t[t.length - 1], 'red');
});

// ------------------------------------------------------------------------------------------ verify CLI

test('--help exits 0; unknown option and unknown --only stack exit 2', () => {
  const root = mkTmp('usage');
  const env = envWith([NODE_DIR]);
  const h = verify(root, ['--help'], env);
  assert.equal(h.code, 0);
  assert.match(h.stdout, /Usage: node \.agents\/scripts\/verify\.mjs/);
  assert.equal(verify(root, ['--bogus'], env).code, 2);
  const o = verify(root, ['--only', 'nope'], env);
  assert.equal(o.code, 2);
  assert.match(o.stderr, /unknown stack "nope"/);
});

test('--list --json shows every stack; missing tools become SKIP with a reason', () => {
  const root = mkTmp('list');
  write(root, 'rs/Cargo.toml', '[package]\nname="x"\n');
  write(root, 'gosvc/go.mod', 'module x\n');
  write(root, 'py/pyproject.toml', '[tool.ruff]\nline-length = 100\n');
  write(root, 'web/package.json', JSON.stringify({ scripts: { test: 'vitest', lint: 'eslint .' } }));
  write(root, 'web/package-lock.json', '{}');
  write(root, 'placeholder/package.json', JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }));
  const r = verify(root, ['--list', '--json'], envWith([path.join(root, 'empty')]));
  assert.equal(r.code, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  const stacks = new Set(j.roots.flatMap((x) => x.stacks));
  for (const s of ['rust', 'go', 'python', 'node']) assert.ok(stacks.has(s), `stack ${s} listed`);
  const find = (root_, step) => j.steps.find((s) => s.root === root_ && s.step === step);
  assert.equal(find('rs', 'test').status, 'SKIP');
  assert.match(find('rs', 'test').reason, /cargo not found in PATH/);
  assert.equal(find('gosvc', 'vet').cmd, 'go vet ./...');
  assert.equal(find('web', 'test').cmd, 'npm run test -- --run', 'vitest gets --run (npm needs --)');
  assert.match(find('placeholder', 'test').reason, /placeholder/);
  assert.match(find('py', 'lint').reason, /ruff not found/);
  // human --list
  const h = verify(root, ['--list'], envWith([path.join(root, 'empty')]));
  assert.match(h.stdout, /^root rs: rust$/m);
  assert.match(h.stdout, /^SKIP rust@rs:test — cargo test \(cargo not found in PATH\)$/m);
  assert.match(h.stdout, /^plan: \d+ steps/m);
  assert.ok(!fs.existsSync(path.join(root, '.agents', '.state', 'last-verify.json')), '--list writes no state');
});

test('missing tools SKIP without failing: exit 0 and VERIFY: PASS', () => {
  const root = mkTmp('skip');
  write(root, 'Cargo.toml', '[package]\nname="x"\n');
  write(root, 'go.mod', 'module x\n');
  const r = verify(root, [], envWith([path.join(root, 'empty')]));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^SKIP rust:test \(0\.0s\) — cargo test \(cargo not found in PATH\)$/m);
  assert.match(r.stdout, /^SKIP go:vet \(0\.0s\) — go vet \.\/\.\.\. \(go not found in PATH\)$/m);
  assert.match(r.stdout, /every step was skipped/);
  assert.equal(r.last, 'VERIFY: PASS');
});

function rustFixture(label) {
  const root = mkTmp(label);
  write(root, 'Cargo.toml', '[package]\nname="x"\n');
  const bin = fakeBin(root, ['cargo', 'cargo-fmt', 'cargo-clippy']);
  const log = path.join(root, 'log.jsonl');
  const env = envWith([bin, NODE_DIR], {
    FAKE_LOG: log, FAKE_RULES: JSON.stringify({ 'cargo test': { code: 101, out: 'test boom_case ... FAILED' } }),
  });
  return { root, log, env };
}

test('a failing step gives exit 1, its output tail, the exact final line, and a state file', () => {
  const { root, log, env } = rustFixture('fail');
  const r = verify(root, [], env);
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^PASS rust:fmt \(\d+\.\ds\) — cargo fmt --check$/m);
  assert.match(r.stdout, /^PASS rust:clippy \(\d+\.\ds\) — cargo clippy --all-targets -- -D warnings$/m);
  assert.match(r.stdout, /^FAIL rust:test \(\d+\.\ds\) — cargo test$/m);
  assert.match(r.stdout, /^ {4}test boom_case \.\.\. FAILED$/m);
  assert.match(r.stdout, /^summary: 2 passed, 1 failed, 0 skipped$/m);
  assert.equal(r.last, 'VERIFY: FAIL (1 failed)');
  const calls = readLog(log);
  assert.deepEqual(calls.map((c) => c.args), [['fmt', '--check'], ['clippy', '--all-targets', '--', '-D', 'warnings'], ['test']]);
  assert.ok(samePath(calls[0].cwd, root), 'runs in the project root');

  const state = JSON.parse(fs.readFileSync(path.join(root, '.agents', '.state', 'last-verify.json'), 'utf8'));
  assert.equal(typeof state.ts, 'number');
  assert.equal(state.ok, false);
  assert.deepEqual(state.args, ['--root', root]);
  assert.equal(state.steps.length, 3);
  for (const s of state.steps) {
    for (const k of ['root', 'stack', 'step', 'cmd', 'exit', 'ms', 'status']) assert.ok(k in s, `step has ${k}`);
  }
  assert.deepEqual(state.steps.map((s) => [s.step, s.status, s.exit]), [['fmt', 'PASS', 0], ['clippy', 'PASS', 0], ['test', 'FAIL', 101]]);
});

test('--quick skips test/build steps', () => {
  const { root, log, env } = rustFixture('quick');
  const r = verify(root, ['--quick'], env);
  assert.equal(r.code, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /rust:test/);
  assert.equal(r.last, 'VERIFY: PASS');
  assert.ok(!readLog(log).some((c) => c.args[0] === 'test'));
  const state = JSON.parse(fs.readFileSync(path.join(root, '.agents', '.state', 'last-verify.json'), 'utf8'));
  assert.equal(state.ok, true);
  assert.deepEqual(state.args, ['--root', root, '--quick']);
});

test('--json prints the result object with failure tails', () => {
  const { root, env } = rustFixture('json');
  const r = verify(root, ['--json'], env);
  assert.equal(r.code, 1);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, false);
  assert.equal(j.summary, 'VERIFY: FAIL (1 failed)');
  const failed = j.steps.find((s) => s.status === 'FAIL');
  assert.equal(failed.step, 'test');
  assert.ok(failed.tail.some((l) => l.includes('boom_case')));
});

test('--only filters stacks and stack:step; gofmt output fails the fmt step', () => {
  const root = mkTmp('only');
  write(root, 'Cargo.toml', '[package]\nname="x"\n');
  write(root, 'svc/go.mod', 'module x\n');
  const bin = fakeBin(root, ['cargo', 'cargo-fmt', 'cargo-clippy', 'go', 'gofmt']);
  const log = path.join(root, 'log.jsonl');
  const env = envWith([bin, NODE_DIR], { FAKE_LOG: log, FAKE_RULES: JSON.stringify({ 'gofmt -l .': { code: 0, out: 'main.go' } }) });
  const r = verify(root, ['--only', 'go'], env);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /^FAIL go@svc:fmt \(\d+\.\ds\) — gofmt -l \. \(files need formatting\)$/m);
  assert.match(r.stdout, /^ {4}main\.go$/m);
  assert.match(r.stdout, /^PASS go@svc:vet /m);
  assert.doesNotMatch(r.stdout, /rust:/);
  assert.ok(readLog(log).every((c) => c.name === 'go' || c.name === 'gofmt'));
  const r2 = verify(root, ['--only', 'rs:test,golang:vet'], env);
  assert.deepEqual(r2.lines.filter((l) => /^(PASS|FAIL|SKIP) /.test(l)).map((l) => l.split(' ')[1]), ['go@svc:vet', 'rust:test']);
});

test('node: pm from bun.lock (even with a stale pnpm-lock.yaml), vitest gets --run, fast-to-slow order', () => {
  const root = mkTmp('node');
  write(root, 'package.json', JSON.stringify({
    scripts: {
      lint: 'node -e "console.log(1)"', typecheck: 'node -e "process.exit(0)"', test: 'vitest',
      build: 'node -e "console.log(\'build-broke\');process.exit(2)"',
    },
  }));
  write(root, 'bun.lock', '');
  write(root, 'pnpm-lock.yaml', '');
  const bin = fakeBin(root, ['bun', 'pnpm']);
  const log = path.join(root, 'log.jsonl');
  const env = envWith([bin, NODE_DIR], { FAKE_LOG: log, FAKE_RULES: JSON.stringify({ 'bun run test': { code: 0 } }) });
  const r = verify(root, [], env);
  assert.equal(r.code, 1, r.stdout + r.stderr);
  const order = r.lines.filter((l) => /^(PASS|FAIL|SKIP) /.test(l)).map((l) => `${l.split(' ')[0]} ${l.split(' ')[1]}`);
  assert.deepEqual(order, ['PASS node:lint', 'PASS node:typecheck', 'PASS node:test', 'FAIL node:build']);
  assert.match(r.stdout, /build-broke/);
  const calls = readLog(log);
  assert.ok(calls.every((c) => c.name === 'bun'), 'bun chosen, pnpm never called');
  assert.deepEqual(calls.find((c) => c.args[1] === 'test').args, ['run', 'test', '--run']);
});

test('node: no typecheck script + tsconfig.json + local typescript runs tsc --noEmit', () => {
  const root = mkTmp('tsc');
  write(root, 'package.json', '{"scripts":{}}');
  write(root, 'tsconfig.json', '{}');
  write(root, 'node_modules/typescript/bin/tsc', `require('fs').writeFileSync(${JSON.stringify(path.join(root, 'tsc.log'))}, JSON.stringify(process.argv.slice(2)));\n`);
  const r = verify(root, ['--only', 'node:typecheck'], envWith([NODE_DIR]));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^PASS node:typecheck \(\d+\.\ds\) — tsc --noEmit$/m);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'tsc.log'), 'utf8')), ['--noEmit']);
});

test('real npm (if installed): scripts run in a path with spaces, a failing test script fails', { skip: !which('npm') && 'npm not installed' }, () => {
  const root = mkTmp('npm');
  write(root, 'package.json', JSON.stringify({
    name: 'fk-npm-smoke', version: '1.0.0', private: true,
    scripts: { lint: 'node -e "process.exit(0)"', test: 'node -e "console.log(\'np-fail-marker\');process.exit(4)"' },
  }));
  const r = verify(root, ['--only', 'node'], envWith([NODE_DIR]));
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^PASS node:lint \(\d+\.\ds\) — npm run lint$/m);
  assert.match(r.stdout, /^FAIL node:test \(\d+\.\ds\) — npm run test$/m);
  assert.match(r.stdout, /np-fail-marker/);
  assert.equal(r.last, 'VERIFY: FAIL (1 failed)');
});

test('agent-kit: doctor + node --test steps run; a hung step times out and its process tree is killed', async () => {
  const root = mkTmp('kit');
  const pidFile = path.join(root, 'grandchild.pid');
  write(root, '.agents/scripts/doctor.mjs', `import { spawn } from 'node:child_process';
import fs from 'node:fs';
const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
fs.writeFileSync(process.env.PID_FILE, String(c.pid));
setInterval(() => {}, 1000);
`);
  write(root, '.agents/scripts/test/ok.test.mjs', "import test from 'node:test';\ntest('ok', () => {});\n");
  write(root, '.agents/scripts/test/helper.mjs', 'throw new Error("helpers are not test files");\n');
  const r = verify(root, ['--timeout', '3'], envWith([NODE_DIR], { PID_FILE: pidFile }));
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^FAIL agent-kit:doctor \(\d+\.\ds\) — node \.agents\/scripts\/doctor\.mjs --quiet \(timed out after 3s; process tree killed\)$/m);
  assert.match(r.stdout, /^PASS agent-kit:test-scripts \(\d+\.\ds\) — node --test \.agents\/scripts\/test\/ok\.test\.mjs$/m);
  assert.equal(r.last, 'VERIFY: FAIL (1 failed)');
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  let alive = true;
  for (let i = 0; i < 30 && alive; i += 1) {
    try { process.kill(pid, 0); await new Promise((res) => setTimeout(res, 200)); } catch { alive = false; }
  }
  if (alive) { try { process.kill(pid); } catch { /* ignore */ } }
  assert.equal(alive, false, 'grandchild process was killed with the tree');
});

test('refuses to recurse when a project script calls verify.mjs for the same root', () => {
  const root = mkTmp('nested');
  const r = verify(root, [], envWith([NODE_DIR], { FRONTIER_VERIFY_ROOT: root }));
  assert.equal(r.code, 2);
  assert.match(r.stderr, /refusing to run inside another verify\.mjs run/);
});

const GIT = which('git');
test('--changed limits to roots with git changes; falls back to all roots outside git', { skip: !GIT && 'git not installed' }, () => {
  const root = mkTmp('changed');
  write(root, 'a/Cargo.toml', '[package]\nname="a"\n');
  write(root, 'b/go.mod', 'module b\n');
  const env = envWith([path.dirname(GIT), NODE_DIR], { GIT_CEILING_DIRECTORIES: path.dirname(root) });
  const noGit = JSON.parse(verify(root, ['--changed', '--list', '--json'], env).stdout);
  assert.match(noGit.notes[0], /not a git repository/);
  assert.deepEqual([...new Set(noGit.steps.map((s) => s.root))].sort(), ['a', 'b']);
  const git = (...args) => {
    const g = spawnSync(GIT, ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: root, env, encoding: 'utf8' });
    assert.equal(g.status, 0, g.stderr);
  };
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  write(root, 'b/main.go', 'package main\n');
  const j = JSON.parse(verify(root, ['--changed', '--list', '--json'], env).stdout);
  assert.deepEqual([...new Set(j.steps.map((s) => s.root))], ['b']);
  assert.match(j.notes[0], /roots: b/);
});
