#!/usr/bin/env node
// verify.mjs — polyglot verification gate for the Frontier Kit (.agents/docs/architecture.md).
// Detects project roots (depth ≤ 3), runs per-stack checks fast → slow, prints one line per step and a
// final `VERIFY: PASS` / `VERIFY: FAIL (<n> failed)`, and records the run in .agents/.state/last-verify.json.
// Node >= 18, ESM, zero dependencies. Exit: 0 pass, 1 check failure, 2 usage/internal error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { which, run, childEnv, tailLines, getEnv, IS_WIN } from './lib/proc.mjs';
import {
  STACKS, resolveStackId, findManifestDirs, projectRoots, detectPackageManager, readJson, readText, exists, isDir, toPosix,
} from './lib/stacks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');
const DEFAULT_TIMEOUT_SEC = 600;
const TAIL_LINES = 60;
const PHASE = { format: 0, lint: 1, compile: 2, typecheck: 2, test: 3, build: 4, e2e: 5 };
const SLOW_KINDS = new Set(['test', 'build', 'e2e']);
const NESTED_ENV = 'FRONTIER_VERIFY_ROOT';

const USAGE = `Usage: node .agents/scripts/verify.mjs [options]

Detects project roots (depth <= 3) and runs per-stack checks: format/lint -> typecheck -> test -> build.
Prints "PASS|FAIL|SKIP <stack>:<step> (<secs>s) — <cmd>" per step (last ${TAIL_LINES} output lines for FAIL)
and ends with "VERIFY: PASS" or "VERIFY: FAIL (<n> failed)". Writes .agents/.state/last-verify.json.

Options:
  --quick             skip test, build and e2e steps (format, lint, typecheck/compile only)
  --changed           only roots containing files changed per "git status --porcelain" (fallback: all roots)
  --only <list>       comma list of stacks (or stack:step), e.g. --only node,rust  --only node:test
                      stacks: ${STACKS.join(', ')}
  --e2e               also run the "test:e2e" package.json script
  --json              print the result as JSON instead of text
  --list              print the detected roots and planned steps without running anything
  --timeout <sec>     per-step timeout in seconds (default ${DEFAULT_TIMEOUT_SEC}; 0 = none); the process tree is killed
  --root <dir>        project root (default: the repo containing .agents/scripts/verify.mjs)
  -h, --help          show this help

A SKIP (tool missing, step not configured) is not a failure. Exit codes: 0 pass, 1 failure, 2 usage/internal error.`;

class UsageError extends Error {}

function parseArgs(argv) {
  const o = { quick: false, changed: false, only: null, e2e: false, json: false, list: false, timeoutSec: DEFAULT_TIMEOUT_SEC, root: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    let a = argv[i];
    let val = null;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { val = a.slice(eq + 1); a = a.slice(0, eq); }
    const need = () => {
      if (val !== null) return val;
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new UsageError(`${a} needs a value`);
      i += 1;
      return v;
    };
    switch (a) {
      case '--quick': o.quick = true; break;
      case '--changed': o.changed = true; break;
      case '--e2e': o.e2e = true; break;
      case '--json': o.json = true; break;
      case '--list': o.list = true; break;
      case '-h': case '--help': o.help = true; break;
      case '--root': o.root = need(); break;
      case '--timeout': {
        const n = Number(need());
        if (!Number.isFinite(n) || n < 0) throw new UsageError('--timeout must be a number of seconds >= 0');
        o.timeoutSec = n;
        break;
      }
      case '--only': {
        const tokens = need().split(',').map((t) => t.trim()).filter(Boolean);
        if (!tokens.length) throw new UsageError('--only needs at least one stack');
        o.only = o.only || [];
        for (const t of tokens) {
          const [s, step] = t.split(':');
          const id = resolveStackId(s);
          if (!id) throw new UsageError(`unknown stack "${s}" (known: ${STACKS.join(', ')})`);
          o.only.push({ stack: id, step: step ? step.toLowerCase() : null });
        }
        break;
      }
      default: throw new UsageError(`unknown option: ${argv[i]}`);
    }
  }
  return o;
}

// ---------------------------------------------------------------------------------------------- planning

function mkStep(root, stack, step, kind, display, file, args, extra = {}) {
  return {
    root: root.rel, cwd: root.dir, scope: extra.scope || root.dir, stack, step, kind, display,
    file: file || null, args: args || [],
    skip: extra.skip || (file || extra.fail ? null : 'not available'),
    fail: extra.fail || null, failOnOutput: !!extra.failOnOutput, skipExit: extra.skipExit || null,
  };
}

function findUp(dir, stop, rel) {
  let d = path.resolve(dir);
  const s = path.resolve(stop);
  for (let i = 0; i < 32; i += 1) {
    const p = path.join(d, rel);
    if (exists(p)) return p;
    const parent = path.dirname(d);
    if (parent === d || path.relative(s, d) === '' || path.relative(s, parent).startsWith('..')) break;
    d = parent;
  }
  return null;
}

function safeReaddir(dir) {
  try { return fs.readdirSync(dir).sort(); } catch { return []; }
}

/** Planner helper bound to one root + stack. */
function planner(root, stack, steps) {
  const add = (step, kind, display, file, args, extra) => steps.push(mkStep(root, stack, step, kind, display, file, args, extra));
  return {
    add,
    /** Run `bin` (already resolved or null) with args; SKIP with `missing` if bin is null. */
    tool: (step, kind, bin, name, args, extra = {}) => {
      const display = [name, ...args].join(' ');
      if (!bin) add(step, kind, display, null, [], { ...extra, skip: `${name} not found in PATH` });
      else add(step, kind, display, bin, args, extra);
    },
    none: (step, kind, reason) => add(step, kind, 'n/a', null, [], { skip: reason }),
  };
}

function planNode(root, ctx, steps) {
  const { add, none } = planner(root, 'node', steps);
  const pkg = readJson(path.join(root.dir, 'package.json'));
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    add('manifest', 'lint', 'parse package.json', null, [], { fail: 'package.json is not valid JSON' });
    return;
  }
  const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const { pm, source } = detectPackageManager(root.dir, ctx.repoRoot);
  root.pm = pm; root.pmSource = source;
  const pmBin = which(pm, { cwd: root.dir });
  const script = (step, kind, name, extraArgs = []) => {
    const args = ['run', name];
    if (extraArgs.length) args.push(...(pm === 'npm' ? ['--', ...extraArgs] : extraArgs));
    const display = [pm, ...args].join(' ');
    if (!pmBin) add(step, kind, display, null, [], { skip: `${pm} not found in PATH (chosen from ${source})` });
    else add(step, kind, display, pmBin, args);
  };
  const has = (n) => typeof scripts[n] === 'string' && scripts[n].trim() !== '';

  if (has('lint')) script('lint', 'lint', 'lint'); else none('lint', 'lint', 'no "lint" script in package.json');

  const tc = ['typecheck', 'type-check', 'check-types'].find(has);
  if (tc) script('typecheck', 'typecheck', tc);
  else if (exists(path.join(root.dir, 'tsconfig.json'))) {
    const tsc = findUp(root.dir, ctx.repoRoot, path.join('node_modules', 'typescript', 'bin', 'tsc'));
    if (tsc) add('typecheck', 'typecheck', 'tsc --noEmit', process.execPath, [tsc, '--noEmit']);
    else none('typecheck', 'typecheck', 'tsconfig.json found but typescript is not installed locally (install dependencies)');
  } else none('typecheck', 'typecheck', 'no typecheck script and no tsconfig.json');

  if (has('test') && !/no test specified/i.test(scripts.test)) {
    const t = scripts.test;
    const extra = /\bvitest\b/.test(t) && !/\bvitest\s+run\b|--run\b/.test(t) ? ['--run'] : [];
    script('test', 'test', 'test', extra);
  } else none('test', 'test', has('test') ? 'placeholder "test" script' : 'no "test" script in package.json');

  if (has('build')) script('build', 'build', 'build'); else none('build', 'build', 'no "build" script in package.json');
  if (ctx.opts.e2e) {
    if (has('test:e2e')) script('e2e', 'e2e', 'test:e2e'); else none('e2e', 'e2e', 'no "test:e2e" script in package.json');
  }
}

function planDeno(root, ctx, steps) {
  const { tool, none } = planner(root, 'deno', steps);
  const cfg = readJson(path.join(root.dir, root.files.includes('deno.json') ? 'deno.json' : 'deno.jsonc')) || {};
  const tasks = cfg.tasks && typeof cfg.tasks === 'object' ? cfg.tasks : {};
  const deno = which('deno', { cwd: root.dir });
  tool('lint', 'lint', deno, 'deno', tasks.lint ? ['task', 'lint'] : ['lint']);
  const tc = ['check', 'typecheck'].find((t) => tasks[t]);
  if (tc) tool('typecheck', 'typecheck', deno, 'deno', ['task', tc]); else none('typecheck', 'typecheck', 'no "check" task in deno config');
  if (tasks.test) tool('test', 'test', deno, 'deno', ['task', 'test']); else none('test', 'test', 'no "test" task in deno config');
  if (tasks.build) tool('build', 'build', deno, 'deno', ['task', 'build']);
}

function planPython(root, ctx, steps) {
  const { add, none } = planner(root, 'python', steps);
  const d = root.dir;
  const pyproject = readText(path.join(d, 'pyproject.toml'));
  const setupCfg = readText(path.join(d, 'setup.cfg'));
  const declText = [pyproject, setupCfg, ...root.files
    .filter((f) => /^requirements.*\.txt$/i.test(f) || f === 'Pipfile' || f === 'setup.py')
    .map((f) => readText(path.join(d, f)))].join('\n');
  const uvLock = exists(path.join(d, 'uv.lock')) ? readText(path.join(d, 'uv.lock')) || ' ' : '';
  const uv = uvLock ? which('uv', { cwd: d }) : null;
  const venvBin = ['.venv', 'venv'].map((v) => path.join(d, v, IS_WIN ? 'Scripts' : 'bin')).find(isDir);
  const declared = (name) => new RegExp(`(^|[^A-Za-z0-9_-])${name}([^A-Za-z0-9_-]|$)`, 'im').test(declText)
    || new RegExp(`name = "${name}"`).test(uvLock);
  const resolve = (name) => {
    const inVenv = venvBin ? which(path.join(venvBin, name)) : null;
    if (uv && (inVenv || declared(name))) return { bin: uv, pre: ['run', name], display: `uv run ${name}` };
    if (inVenv) return { bin: inVenv, pre: [], display: toPosix(path.relative(d, inVenv)).replace(/\.exe$/i, '') };
    const g = which(name, { cwd: d });
    return g ? { bin: g, pre: [], display: name } : null;
  };
  const runTool = (step, kind, name, args, extra = {}) => {
    const r = resolve(name);
    if (!r) { none(step, kind, `${name} not found (.venv, uv project or PATH)`); return; }
    add(step, kind, [r.display, ...args].join(' '), r.bin, [...r.pre, ...args], extra);
  };
  const ruffConfigured = exists(path.join(d, 'ruff.toml')) || exists(path.join(d, '.ruff.toml'))
    || /^\s*\[tool\.ruff/m.test(pyproject) || declared('ruff');
  if (ruffConfigured) {
    runTool('format', 'format', 'ruff', ['format', '--check', '.']);
    runTool('lint', 'lint', 'ruff', ['check', '.']);
  } else {
    none('lint', 'lint', 'ruff not configured (no ruff.toml, [tool.ruff] or ruff dependency)');
  }
  const mypyIni = readText(path.join(d, 'mypy.ini')) || readText(path.join(d, '.mypy.ini'));
  const mypyConfigured = !!mypyIni || /^\s*\[tool\.mypy/m.test(pyproject) || /^\s*\[mypy/m.test(setupCfg);
  if (mypyConfigured) {
    const hasFiles = /^\s*files\s*=/m.test(`${mypyIni}\n${pyproject}\n${setupCfg}`);
    runTool('typecheck', 'typecheck', 'mypy', hasFiles ? [] : ['.']);
  } else none('typecheck', 'typecheck', 'mypy not configured');
  runTool('test', 'test', 'pytest', ['-q'], { skipExit: { 5: 'pytest collected no tests' } });
}

function planGo(root, ctx, steps) {
  const { tool } = planner(root, 'go', steps);
  const go = which('go', { cwd: root.dir });
  tool('fmt', 'format', which('gofmt', { cwd: root.dir }), 'gofmt', ['-l', '.'], { failOnOutput: true });
  tool('vet', 'lint', go, 'go', ['vet', './...']);
  tool('test', 'test', go, 'go', ['test', './...']);
}

function planRust(root, ctx, steps) {
  const { tool, none } = planner(root, 'rust', steps);
  const cargo = which('cargo', { cwd: root.dir });
  const ws = /^\s*\[workspace\]/m.test(readText(path.join(root.dir, 'Cargo.toml')));
  if (cargo && !which('cargo-fmt', { cwd: root.dir }) && !which('rustfmt', { cwd: root.dir })) {
    none('fmt', 'format', 'rustfmt not installed (rustup component add rustfmt)');
  } else tool('fmt', 'format', cargo, 'cargo', ['fmt', ...(ws ? ['--all'] : []), '--check']);
  if (cargo && !which('cargo-clippy', { cwd: root.dir })) {
    tool('check', 'lint', cargo, 'cargo', ['check', ...(ws ? ['--workspace'] : []), '--all-targets']);
  } else tool('clippy', 'lint', cargo, 'cargo', ['clippy', ...(ws ? ['--workspace'] : []), '--all-targets', '--', '-D', 'warnings']);
  tool('test', 'test', cargo, 'cargo', ['test', ...(ws ? ['--workspace'] : [])]);
}

function planPhp(root, ctx, steps) {
  const { add, tool, none } = planner(root, 'php', steps);
  const d = root.dir;
  const php = which('php', { cwd: d });
  tool('validate', 'lint', which('composer', { cwd: d }), 'composer', ['validate', '--no-check-publish']);
  const vendor = (n) => exists(path.join(d, 'vendor', 'bin', n));
  const phpTool = (step, kind, script, args) => {
    const display = ['php', script, ...args].join(' ');
    if (!php) add(step, kind, display, null, [], { skip: 'php not found in PATH' });
    else add(step, kind, display, php, [script, ...args]);
  };
  if (vendor('pint')) phpTool('pint', 'format', 'vendor/bin/pint', ['--test']);
  else none('pint', 'format', 'vendor/bin/pint not installed');
  const stanCfg = ['phpstan.neon', 'phpstan.neon.dist', 'phpstan.dist.neon'].some((f) => exists(path.join(d, f)));
  if (vendor('phpstan') && stanCfg) phpTool('phpstan', 'typecheck', 'vendor/bin/phpstan', ['analyse', '--no-progress']);
  else none('phpstan', 'typecheck', vendor('phpstan') ? 'no phpstan.neon config' : 'vendor/bin/phpstan not installed');
  if (vendor('pest')) phpTool('test', 'test', 'vendor/bin/pest', []);
  else if (vendor('phpunit')) phpTool('test', 'test', 'vendor/bin/phpunit', []);
  else if (exists(path.join(d, 'artisan'))) phpTool('test', 'test', 'artisan', ['test']);
  else none('test', 'test', 'no vendor/bin/pest, vendor/bin/phpunit or artisan (run composer install)');
}

/** Resolve a project wrapper script (mvnw/gradlew) or a PATH tool. Returns { bin, pre, display } or null. */
function wrapperOrTool(dir, wrapper, toolName) {
  const w = path.join(dir, IS_WIN ? `${wrapper}${wrapper === 'gradlew' ? '.bat' : '.cmd'}` : wrapper);
  if (exists(w)) {
    if (IS_WIN) return { bin: w, pre: [], display: `./${wrapper}` };
    if (which(w)) return { bin: w, pre: [], display: `./${wrapper}` };
    const sh = which('sh');
    if (sh) return { bin: sh, pre: [w], display: `sh ${wrapper}` };
  }
  const t = which(toolName, { cwd: dir });
  return t ? { bin: t, pre: [], display: toolName } : null;
}

function planJvm(root, ctx, steps) {
  const { add, none } = planner(root, 'jvm', steps);
  const d = root.dir;
  const gradle = root.files.some((f) => /^(build|settings)\.gradle(\.kts)?$/.test(f));
  const r = gradle ? wrapperOrTool(d, 'gradlew', 'gradle') : wrapperOrTool(d, 'mvnw', 'mvn');
  const quick = ctx.opts.quick;
  const [step, kind, args] = gradle
    ? (quick ? ['compile', 'compile', ['assemble']] : ['check', 'test', ['check']])
    : (quick ? ['compile', 'compile', ['-q', '-B', 'compile']] : ['verify', 'test', ['-q', '-B', 'verify']]);
  if (!r) none(step, kind, `${gradle ? 'gradlew/gradle' : 'mvnw/mvn'} not found`);
  else add(step, kind, [r.display, ...args].join(' '), r.bin, [...r.pre, ...args]);
}

function planDotnet(root, ctx, steps) {
  const { tool, none } = planner(root, 'dotnet', steps);
  const slns = root.files.filter((f) => /\.slnx?$/i.test(f));
  const projs = root.files.filter((f) => /\.(csproj|fsproj|vbproj)$/i.test(f));
  let target = [];
  if (slns.length + projs.length > 1) {
    if (!slns.length) {
      none('build', 'compile', 'several project files and no .sln here; build them individually');
      return;
    }
    target = [slns[0]];
  }
  const dotnet = which('dotnet', { cwd: root.dir });
  tool('build', 'compile', dotnet, 'dotnet', ['build', '--nologo', ...target]);
  tool('test', 'test', dotnet, 'dotnet', ['test', '--nologo', ...target]);
}

function planRuby(root, ctx, steps) {
  const { add, tool, none } = planner(root, 'ruby', steps);
  const d = root.dir;
  const gems = `${readText(path.join(d, 'Gemfile'))}\n${readText(path.join(d, 'Gemfile.lock'))}`;
  const bundle = which('bundle', { cwd: d });
  if (/\brubocop\b/.test(gems)) tool('rubocop', 'lint', bundle, 'bundle', ['exec', 'rubocop']);
  else none('rubocop', 'lint', 'rubocop not in Gemfile');
  if (isDir(path.join(d, 'spec')) && /\brspec\b/.test(gems)) tool('test', 'test', bundle, 'bundle', ['exec', 'rspec']);
  else if (exists(path.join(d, 'bin', 'rails')) && isDir(path.join(d, 'test'))) {
    const ruby = which('ruby', { cwd: d });
    if (ruby) add('test', 'test', 'bin/rails test', ruby, [path.join('bin', 'rails'), 'test']);
    else none('test', 'test', 'ruby not found in PATH');
  } else none('test', 'test', 'no spec/ with rspec and no bin/rails test');
}

function planDart(root, ctx, steps) {
  const { tool, none } = planner(root, 'dart', steps);
  const pub = readText(path.join(root.dir, 'pubspec.yaml'));
  const name = /^\s*flutter\s*:/m.test(pub) || /sdk:\s*flutter/.test(pub) ? 'flutter' : 'dart';
  const bin = which(name, { cwd: root.dir });
  tool('analyze', 'lint', bin, name, ['analyze']);
  if (isDir(path.join(root.dir, 'test'))) tool('test', 'test', bin, name, ['test']);
  else none('test', 'test', 'no test/ directory');
}

function planElixir(root, ctx, steps) {
  const { tool } = planner(root, 'elixir', steps);
  const mix = which('mix', { cwd: root.dir });
  tool('format', 'format', mix, 'mix', ['format', '--check-formatted']);
  tool('compile', 'compile', mix, 'mix', ['compile', '--warnings-as-errors']);
  tool('test', 'test', mix, 'mix', ['test']);
}

function planSwift(root, ctx, steps) {
  const { tool, none } = planner(root, 'swift', steps);
  const swift = which('swift', { cwd: root.dir });
  tool('build', 'compile', swift, 'swift', ['build']);
  if (isDir(path.join(root.dir, 'Tests'))) tool('test', 'test', swift, 'swift', ['test']);
  else none('test', 'test', 'no Tests/ directory');
}

function findCmakeBuildDir(d) {
  const ok = (rel) => exists(path.join(d, rel, 'CMakeCache.txt'));
  for (const c of ['build', '_build', 'cmake-build-debug', 'cmake-build-release']) if (ok(c)) return c;
  for (const e of safeReaddir(d)) if (/^cmake-build-/.test(e) && ok(e)) return e;
  for (const base of ['out/build', 'build']) {
    for (const e of safeReaddir(path.join(d, base))) if (ok(`${base}/${e}`)) return `${base}/${e}`;
  }
  return null;
}

function planCpp(root, ctx, steps) {
  const { tool, none } = planner(root, 'cpp', steps);
  const dir = findCmakeBuildDir(root.dir);
  if (!dir) {
    none('build', 'compile', 'no configured CMake build dir (configure once: cmake -S . -B build)');
    return;
  }
  tool('build', 'compile', which('cmake', { cwd: root.dir }), 'cmake', ['--build', dir]);
  tool('test', 'test', which('ctest', { cwd: root.dir }), 'ctest', ['--test-dir', dir, '--output-on-failure']);
}

const TEST_FILE = /(\.test|[-_]test)\.(c|m)?js$|^test[-_].+\.(c|m)?js$/;

function planAgentKit(ctx, steps) {
  const kitDir = path.join(ctx.repoRoot, '.agents');
  const root = { rel: '.', dir: ctx.repoRoot };
  const { add } = planner(root, 'agent-kit', steps);
  const scope = kitDir;
  const doctor = path.join(kitDir, 'scripts', 'doctor.mjs');
  if (exists(doctor)) {
    add('doctor', 'lint', 'node .agents/scripts/doctor.mjs --quiet', process.execPath, [doctor, '--quiet'], { scope });
  }
  for (const [step, rel] of [['test-hooks', '.agents/hooks/test'], ['test-scripts', '.agents/scripts/test']]) {
    const dir = path.join(ctx.repoRoot, ...rel.split('/'));
    const files = safeReaddir(dir).filter((f) => TEST_FILE.test(f));
    if (!files.length) continue;
    const display = files.length <= 3
      ? `node --test ${files.map((f) => `${rel}/${f}`).join(' ')}`
      : `node --test ${rel}/*.test.mjs (${files.length} files)`;
    add(step, 'test', display, process.execPath, ['--test', ...files.map((f) => path.join(dir, f))], { scope });
  }
}

const PLANNERS = {
  node: planNode, deno: planDeno, python: planPython, go: planGo, rust: planRust, php: planPhp, ruby: planRuby,
  jvm: planJvm, dotnet: planDotnet, dart: planDart, elixir: planElixir, swift: planSwift, cpp: planCpp,
};

function buildPlan(ctx) {
  const roots = projectRoots(findManifestDirs(ctx.repoRoot, 3));
  const steps = [];
  for (const root of roots) {
    for (const stack of root.stacks) PLANNERS[stack](root, ctx, steps);
  }
  planAgentKit(ctx, steps);
  steps.forEach((s, i) => { s.order = i; });
  return { roots, steps };
}

// ----------------------------------------------------------------------------------------------- filters

async function gitChangedFiles(repoRoot, env) {
  const git = which('git', { cwd: repoRoot });
  if (!git) return { files: null, why: 'git not found' };
  const top = await run(git, ['rev-parse', '--show-toplevel'], { cwd: repoRoot, env, timeoutMs: 15000 });
  if (top.exit !== 0) return { files: null, why: 'not a git repository' };
  const st = await run(git, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: repoRoot, env, timeoutMs: 60000 });
  if (st.exit !== 0) return { files: null, why: 'git status failed' };
  const topDir = top.stdout.trim();
  const parts = st.stdout.split('\0');
  const files = [];
  for (let i = 0; i < parts.length; i += 1) {
    const e = parts[i];
    if (e.length < 4) continue;
    const xy = e.slice(0, 2);
    files.push(path.resolve(topDir, e.slice(3)));
    if (/[RC]/.test(xy) && parts[i + 1]) { files.push(path.resolve(topDir, parts[i + 1])); i += 1; }
  }
  return { files, why: null };
}

function within(file, dir) {
  const r = path.relative(dir, file);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}

async function applyFilters(plan, ctx) {
  let steps = plan.steps;
  const notes = [];
  if (ctx.opts.only) {
    steps = steps.filter((s) => ctx.opts.only.some((o) => o.stack === s.stack && (!o.step || o.step === s.step)));
  }
  if (ctx.opts.quick) steps = steps.filter((s) => !SLOW_KINDS.has(s.kind));
  if (ctx.opts.changed) {
    const { files, why } = await gitChangedFiles(ctx.repoRoot, ctx.env);
    if (!files) {
      notes.push(`changed: ${why} — running all roots`);
    } else {
      const scopes = [...new Set(steps.map((s) => s.scope))];
      const hit = new Set();
      for (const f of files) {
        const owners = scopes.filter((sc) => within(f, sc)).sort((a, b) => b.length - a.length);
        if (owners.length) hit.add(owners[0]);
      }
      steps = steps.filter((s) => hit.has(s.scope));
      const rels = [...hit].map((sc) => toPosix(path.relative(ctx.repoRoot, sc)) || '.');
      notes.push(`changed: ${files.length} changed file(s) — roots: ${rels.length ? rels.join(', ') : 'none'}`);
    }
  }
  steps = [...steps].sort((a, b) => (PHASE[a.kind] - PHASE[b.kind]) || (a.order - b.order));
  return { steps, notes };
}

// --------------------------------------------------------------------------------------------- execution

const label = (s) => `${s.stack}${s.root === '.' ? '' : `@${s.root}`}:${s.step}`;

async function execStep(s, ctx) {
  if (s.fail) return { status: 'FAIL', exit: null, ms: 0, reason: s.fail, tail: [] };
  if (s.skip) return { status: 'SKIP', exit: null, ms: 0, reason: s.skip, tail: [] };
  const res = await run(s.file, s.args, { cwd: s.cwd, env: ctx.env, timeoutMs: ctx.opts.timeoutSec * 1000 });
  const tail = tailLines(res.output, TAIL_LINES);
  if (res.droppedBytes > 0) tail.unshift(`(output truncated: ${res.droppedBytes} earlier bytes dropped)`);
  if (res.error) return { status: 'FAIL', exit: null, ms: res.ms, reason: `could not start: ${res.error}`, tail };
  if (res.timedOut) {
    return { status: 'FAIL', exit: null, ms: res.ms, reason: `timed out after ${ctx.opts.timeoutSec}s; process tree killed`, tail };
  }
  if (s.skipExit && s.skipExit[res.exit]) return { status: 'SKIP', exit: res.exit, ms: res.ms, reason: s.skipExit[res.exit], tail: [] };
  if (res.exit !== 0) return { status: 'FAIL', exit: res.exit, ms: res.ms, reason: null, tail };
  if (s.failOnOutput && res.stdout.trim()) {
    return { status: 'FAIL', exit: res.exit, ms: res.ms, reason: 'files need formatting', tail: tailLines(res.stdout, TAIL_LINES) };
  }
  return { status: 'PASS', exit: res.exit, ms: res.ms, reason: null, tail: [] };
}

function stepLine(status, s, ms, reason) {
  const secs = (ms / 1000).toFixed(1);
  return `${status} ${label(s)} (${secs}s) — ${s.display}${reason ? ` (${reason})` : ''}`;
}

function writeState(repoRoot, data) {
  const dir = path.join(repoRoot, '.agents', '.state');
  const file = path.join(dir, 'last-verify.json');
  const body = `${JSON.stringify(data, null, 2)}\n`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, body);
    try { fs.renameSync(tmp, file); } catch { fs.writeFileSync(file, body); try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
    return null;
  } catch (e) {
    return e && e.message ? e.message : String(e);
  }
}

function out(line) {
  try { process.stdout.write(`${line}\n`); } catch { /* closed pipe */ }
}

function rootsSummary(plan, steps) {
  const byRoot = new Map();
  for (const s of steps) {
    if (!byRoot.has(s.root)) byRoot.set(s.root, new Set());
    byRoot.get(s.root).add(s.stack);
  }
  const lines = [];
  for (const [rel, stacks] of byRoot) {
    const r = plan.roots.find((x) => x.rel === rel && x.pm);
    const parts = [...stacks].map((st) => (st === 'node' && r ? `node (pm: ${r.pm} from ${r.pmSource})` : st));
    lines.push({ rel, stacks: [...stacks], pm: r ? r.pm : null, text: `root ${rel}: ${parts.join(', ')}` });
  }
  return lines;
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`verify: ${e.message}\n\n${USAGE}\n`);
      return 2;
    }
    throw e;
  }
  if (opts.help) { out(USAGE); return 0; }
  const repoRoot = path.resolve(opts.root || DEFAULT_ROOT);
  if (!isDir(repoRoot)) { process.stderr.write(`verify: root is not a directory: ${repoRoot}\n`); return 2; }
  const nested = getEnv(process.env, NESTED_ENV);
  if (nested && path.relative(path.resolve(nested), repoRoot) === '') {
    process.stderr.write('verify: refusing to run inside another verify.mjs run for the same root (a project script calls verify.mjs)\n');
    return 2;
  }
  const ctx = { repoRoot, opts, env: childEnv(process.env, { [NESTED_ENV]: repoRoot }) };
  const plan = buildPlan(ctx);
  const { steps, notes } = await applyFilters(plan, ctx);
  const summary = rootsSummary(plan, steps);

  if (opts.list) {
    const planned = steps.map((s) => ({
      root: s.root, stack: s.stack, step: s.step, kind: s.kind, cmd: s.display,
      status: s.fail ? 'FAIL' : s.skip ? 'SKIP' : 'RUN', reason: s.fail || s.skip || undefined,
    }));
    if (opts.json) {
      out(JSON.stringify({ root: toPosix(repoRoot), notes, roots: summary.map(({ text, ...r }) => r), steps: planned }, null, 2));
      return 0;
    }
    for (const n of notes) out(n);
    for (const r of summary) out(r.text);
    if (!planned.length) out(plan.steps.length ? 'no steps match the filters' : 'no project roots detected (depth <= 3)');
    for (const p of planned) out(`${p.status.padEnd(4)} ${label(p)} — ${p.cmd}${p.reason ? ` (${p.reason})` : ''}`);
    const runs = planned.filter((p) => p.status === 'RUN').length;
    out(`plan: ${planned.length} steps (${runs} to run, ${planned.length - runs} skipped)`);
    return 0;
  }

  const startTs = Date.now();
  if (!opts.json) for (const n of notes) out(n);
  const results = [];
  for (const s of steps) {
    const r = await execStep(s, ctx);
    results.push({ s, r });
    if (!opts.json) {
      out(stepLine(r.status, s, r.ms, r.reason));
      if (r.status === 'FAIL') {
        const t = r.tail.length ? r.tail : ['(no output)'];
        for (const l of t) out(`    ${l}`);
      }
    }
  }
  const failed = results.filter((x) => x.r.status === 'FAIL').length;
  const passed = results.filter((x) => x.r.status === 'PASS').length;
  const skipped = results.length - failed - passed;
  const final = failed ? `VERIFY: FAIL (${failed} failed)` : 'VERIFY: PASS';
  const state = {
    ts: Date.now(), startTs, ok: failed === 0, failed, args: argv, root: toPosix(repoRoot),
    steps: results.map(({ s, r }) => ({
      root: s.root, stack: s.stack, step: s.step, cmd: s.display, exit: r.exit, ms: r.ms, status: r.status,
      ...(r.reason ? { reason: r.reason } : {}),
    })),
  };
  const stateErr = writeState(repoRoot, state);
  if (opts.json) {
    const detail = { ...state, summary: final, notes };
    detail.steps = state.steps.map((st, i) => (st.status === 'FAIL' ? { ...st, tail: results[i].r.tail } : st));
    if (stateErr) detail.stateError = stateErr;
    out(JSON.stringify(detail, null, 2));
  } else {
    if (!results.length) out('note: no steps matched — nothing was verified (check --only/--changed or the project manifests)');
    else if (!passed && !failed) out('note: every step was skipped — nothing was verified');
    if (stateErr) out(`note: could not write .agents/.state/last-verify.json: ${stateErr}`);
    out(`summary: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    out(final);
  }
  return failed ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (e) => {
    process.stderr.write(`verify: internal error: ${e && e.stack ? e.stack : e}\n`);
    process.exitCode = 2;
  },
);
