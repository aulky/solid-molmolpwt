#!/usr/bin/env node
// dep-audit.mjs - detect ecosystems and run each one's native vulnerability audit (zero dependencies).
// Part of the Frontier Kit security-audit skill. Node >= 18, ESM, cross-platform (Windows-first).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const HELP = `Usage: node .agents/skills/security-audit/scripts/dep-audit.mjs [path] [options]

Finds project roots (depth <= 3), picks each ecosystem's audit tool from its lockfile, runs it,
and prints a compact summary. Missing tools are SKIPPED with an install hint (not a failure).
Audits send dependency names + versions (not source code) to the advisory service.

Options:
  --list             print the plan (roots, ecosystems, commands) and exit without running
  --only <eco,..>    node,deno,rust,go,python,php,ruby,dotnet,elixir,osv (default: all detected)
  --prod             production dependencies only where the tool supports it
  --no-osv           do not run osv-scanner even if it is installed
  --timeout <sec>    per-command timeout (default: 300)
  --depth <n>        root search depth (default: 3)
  --json             print JSON instead of text
  --help             show this help

Per-step status: CLEAN | ISSUES | ERROR | SKIP | MANUAL. Raw outputs are saved under
.agents/.state/security/dep-audit/ when the repo has an .agents/ folder.
Final line: DEP-AUDIT: CLEAN | ISSUES (...) | ERROR (...).
Exit codes: 0 = clean (skips allowed), 1 = issues or errors, 2 = usage or internal error.`;

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', '.output', '.next', '.nuxt', '.svelte-kit',
  '.vinxi', 'target', 'vendor', '.venv', 'venv', '__pycache__', 'coverage', '.turbo', '.cache', '.gradle', 'bin', 'obj',
  '.dart_tool', '.scratch', '.agents']);
const ECOS = ['node', 'deno', 'rust', 'go', 'python', 'php', 'ruby', 'dotnet', 'elixir', 'dart', 'jvm', 'osv'];
const SEVS = ['critical', 'high', 'moderate', 'medium', 'low', 'info', 'unknown'];

const isWin = process.platform === 'win32';
const toolCache = new Map();
export function hasTool(name) {
  if (toolCache.has(name)) return toolCache.get(name);
  const r = isWin ? spawnSync('where', [name], { encoding: 'utf8', windowsHide: true })
    : spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
  const ok = r.status === 0;
  toolCache.set(name, ok);
  return ok;
}

const exists = (d, f) => fs.existsSync(path.join(d, f));
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

export function findRoots(start, depth) {
  const roots = [];
  const markers = ['package.json', 'deno.json', 'deno.jsonc', 'deno.lock', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'requirements.txt',
    'uv.lock', 'poetry.lock', 'Pipfile.lock', 'composer.json', 'Gemfile', 'mix.exs', 'pubspec.yaml', 'pom.xml', 'build.gradle',
    'build.gradle.kts'];
  const visit = (dir, d) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const names = new Set(ents.filter((e) => e.isFile()).map((e) => e.name));
    if (markers.some((m) => names.has(m)) || [...names].some((n) => /\.(csproj|fsproj|vbproj|sln|slnx)$/i.test(n))) roots.push({ dir, names });
    if (d >= depth) return;
    for (const e of ents) if (e.isDirectory() && !IGNORE_DIRS.has(e.name) && !e.name.startsWith('.')) visit(path.join(dir, e.name), d + 1);
  };
  visit(start, 0);
  return roots;
}

// Build the audit plan for one root. Each step: { eco, root, cmd, parser, status?, reason?, hint? }
export function planRoot(root, opts) {
  const { dir, names } = root;
  const steps = [];
  const add = (s) => steps.push({ root: dir, ...s });
  // Node: one package manager per root, same precedence as verify.mjs.
  if (names.has('package.json')) {
    const locks = ['bun.lock', 'bun.lockb', 'pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'npm-shrinkwrap.json'].filter((l) => names.has(l));
    const note = locks.length > 1 ? `multiple lockfiles (${locks.join(', ')}); auditing the canonical one - others may be stale` : '';
    if (names.has('bun.lock') || names.has('bun.lockb')) {
      add({ eco: 'node', tool: 'bun', cmd: 'bun audit --json', parser: 'bun', note });
    } else if (names.has('pnpm-lock.yaml')) {
      add({ eco: 'node', tool: 'pnpm', cmd: `pnpm audit --json${opts.prod ? ' --prod' : ''}`, parser: 'npm', note });
    } else if (names.has('yarn.lock')) {
      const berry = exists(dir, '.yarnrc.yml');
      add(berry
        ? { eco: 'node', tool: 'yarn', cmd: `yarn npm audit --all --recursive --json${opts.prod ? ' --environment production' : ''}`, parser: 'yarn-berry', note }
        : { eco: 'node', tool: 'yarn', cmd: `yarn audit --json${opts.prod ? ' --groups dependencies' : ''}`, parser: 'yarn-classic', note });
    } else if (names.has('package-lock.json') || names.has('npm-shrinkwrap.json')) {
      add({ eco: 'node', tool: 'npm', cmd: `npm audit --json${opts.prod ? ' --omit=dev' : ''}`, parser: 'npm', note });
    } else {
      const deps = (() => { try { const j = JSON.parse(readText(path.join(dir, 'package.json'))); return Object.keys({ ...j.dependencies, ...j.devDependencies }).length; } catch { return 0; } })();
      if (deps) add({ eco: 'node', status: 'SKIP', reason: 'package.json without a lockfile', hint: 'create one with the project package manager (e.g. `npm install --package-lock-only`), then re-run' });
    }
  }
  if (names.has('deno.lock')) add({ eco: 'deno', tool: 'deno', cmd: 'deno audit', parser: 'exit' });
  if (names.has('Cargo.toml')) {
    if (!names.has('Cargo.lock')) add({ eco: 'rust', status: 'SKIP', reason: 'no Cargo.lock here (workspace member or library?)', hint: 'run from the workspace root, or `cargo generate-lockfile`' });
    else add({ eco: 'rust', tool: 'cargo-audit', cmd: 'cargo audit --json', parser: 'cargo', hint: 'install: `cargo install cargo-audit --locked`' });
  }
  if (names.has('go.mod')) add({ eco: 'go', tool: 'govulncheck', cmd: 'govulncheck -format json ./...', parser: 'govulncheck', hint: 'install: `go install golang.org/x/vuln/cmd/govulncheck@latest`' });
  const reqs = [...names].filter((n) => /^requirements.*\.txt$/i.test(n)).sort();
  if (reqs.length || names.has('pyproject.toml') || names.has('uv.lock') || names.has('poetry.lock') || names.has('Pipfile.lock')) {
    const hint = 'install: `python -m pip install pip-audit` (or run it via `pipx run pip-audit` / `uvx pip-audit`)';
    if (reqs.length) for (const r of reqs) add({ eco: 'python', tool: 'pip-audit', cmd: `pip-audit -r ${r} --format json`, parser: 'pip-audit', hint });
    else if (names.has('uv.lock') && hasTool('uv')) add({ eco: 'python', tool: 'pip-audit', pre: 'uv-export', cmd: 'pip-audit -r {UVREQ} --no-deps --disable-pip --format json', parser: 'pip-audit', hint });
    else if (names.has('pyproject.toml')) add({ eco: 'python', tool: 'pip-audit', cmd: 'pip-audit . --format json', parser: 'pip-audit', hint });
    else add({ eco: 'python', status: 'MANUAL', reason: 'lockfile-only Python project', hint: 'use osv-scanner (`osv-scanner scan source -r .`) or export requirements and run `pip-audit -r <file>`' });
  }
  if (names.has('composer.json')) {
    if (names.has('composer.lock')) add({ eco: 'php', tool: 'composer', cmd: `composer audit --locked --format=json${opts.prod ? ' --no-dev' : ''}`, parser: 'composer', hint: 'install Composer: https://getcomposer.org/download/' });
    else add({ eco: 'php', status: 'SKIP', reason: 'composer.json without composer.lock', hint: 'run `composer update --lock` (or install) to create the lockfile' });
  }
  if (names.has('Gemfile.lock')) add({ eco: 'ruby', tool: 'bundle-audit', cmd: 'bundle-audit check --update', parser: 'bundle-audit', hint: 'install: `gem install bundler-audit`' });
  const dotnetProj = [...names].filter((n) => /\.(csproj|fsproj|vbproj|sln|slnx)$/i.test(n)).sort();
  if (dotnetProj.length) {
    const target = dotnetProj.find((n) => /\.slnx?$/i.test(n)) || dotnetProj[0];
    add({ eco: 'dotnet', tool: 'dotnet', cmd: `dotnet list "${target}" package --vulnerable --include-transitive --format json`, parser: 'dotnet', hint: 'needs a .NET SDK; before .NET 10 run `dotnet restore` first' });
  }
  if (names.has('mix.lock')) {
    add({ eco: 'elixir', tool: 'mix', cmd: 'mix deps.audit', parser: 'exit', hint: 'add {:mix_audit, "~> 2.1", only: [:dev, :test], runtime: false} or `mix escript.install hex mix_audit`' });
    add({ eco: 'elixir', tool: 'mix', cmd: 'mix hex.audit', parser: 'exit', hint: 'lists retired Hex packages' });
  }
  if (names.has('pubspec.lock')) add({ eco: 'dart', status: 'MANUAL', reason: 'Dart/Flutter has no built-in vulnerability audit', hint: 'use osv-scanner: `osv-scanner scan source -L pubspec.lock`' });
  if (names.has('pom.xml')) add({ eco: 'jvm', status: 'MANUAL', reason: 'slow NVD download (can take 20+ min the first time)', hint: '`mvn org.owasp:dependency-check-maven:check` or osv-scanner' });
  if (names.has('build.gradle') || names.has('build.gradle.kts')) add({ eco: 'jvm', status: 'MANUAL', reason: 'needs the org.owasp.dependencycheck Gradle plugin', hint: 'apply the plugin, then `./gradlew dependencyCheckAnalyze`, or use osv-scanner' });
  return steps;
}

const stripAnsi = (s) => String(s || '').replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');

// Parse one or more JSON values from text (handles NDJSON, pretty-printed streams and leading noise).
export function parseJsonStream(text) {
  const out = [];
  let depth = 0; let start = -1; let inStr = false; let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { if (depth > 0) inStr = true; continue; }
    if (c === '{' || c === '[') { if (depth === 0) start = i; depth++; }
    else if ((c === '}' || c === ']') && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) { try { out.push(JSON.parse(text.slice(start, i + 1))); } catch { /* skip */ } start = -1; }
    }
  }
  return out;
}

const normSev = (s) => { const v = String(s || 'unknown').toLowerCase(); return v === 'medium' ? 'moderate' : (SEVS.includes(v) ? v : 'unknown'); };
function finish(items) {
  const counts = {};
  for (const it of items) { it.severity = normSev(it.severity); counts[it.severity] = (counts[it.severity] || 0) + 1; }
  return { count: items.length, counts, items };
}

export const PARSERS = {
  bun(text) {
    const [j] = parseJsonStream(text);
    if (!j || Array.isArray(j) || typeof j !== 'object') return null;
    const items = [];
    for (const [pkg, advs] of Object.entries(j)) {
      if (!Array.isArray(advs)) continue;
      for (const a of advs) items.push({ pkg, severity: a.severity, id: (a.url || '').split('/').pop() || String(a.id || ''), title: a.title || '', fix: a.vulnerable_versions ? `vulnerable ${a.vulnerable_versions}` : '' });
    }
    return finish(items);
  },
  npm(text) {
    const j = parseJsonStream(text).find((x) => x && !Array.isArray(x) && (x.vulnerabilities || x.advisories || x.metadata));
    if (!j) return null;
    const items = [];
    if (j.vulnerabilities && typeof j.vulnerabilities === 'object' && !('found' in j.vulnerabilities)) {
      for (const [pkg, v] of Object.entries(j.vulnerabilities)) {
        const via = (v.via || []).filter((x) => typeof x === 'object');
        const first = via[0] || {};
        const fix = v.fixAvailable === true ? 'fix available' : (v.fixAvailable && v.fixAvailable.name ? `fix: ${v.fixAvailable.name}@${v.fixAvailable.version}${v.fixAvailable.isSemVerMajor ? ' (major)' : ''}` : 'no fix');
        items.push({ pkg, severity: v.severity, id: (first.url || '').split('/').pop() || (via.length ? '' : `via ${(v.via || []).join(',')}`), title: first.title || '', fix });
      }
    } else if (j.advisories) {
      for (const a of Object.values(j.advisories)) items.push({ pkg: a.module_name, severity: a.severity, id: a.github_advisory_id || (a.url || '').split('/').pop() || String(a.id || ''), title: a.title || '', fix: a.patched_versions ? `patched ${a.patched_versions}` : '' });
    }
    return finish(items);
  },
  'yarn-classic'(text) {
    const items = [];
    for (const o of parseJsonStream(text)) {
      if (o && o.type === 'auditAdvisory' && o.data && o.data.advisory) {
        const a = o.data.advisory;
        items.push({ pkg: a.module_name, severity: a.severity, id: a.github_advisory_id || String(a.id || ''), title: a.title || '', fix: a.patched_versions ? `patched ${a.patched_versions}` : '' });
      }
    }
    const seen = new Set();
    return finish(items.filter((i) => { const k = `${i.pkg}|${i.id}`; if (seen.has(k)) return false; seen.add(k); return true; }));
  },
  'yarn-berry'(text) {
    const items = [];
    for (const o of parseJsonStream(text)) {
      const c = o && o.children;
      if (c && (c.Severity || c.Issue)) items.push({ pkg: o.value, severity: c.Severity, id: c.ID ? String(c.ID) : (c.URL || '').split('/').pop(), title: c.Issue || '', fix: c['Vulnerable Versions'] ? `vulnerable ${c['Vulnerable Versions']}` : '' });
    }
    return finish(items);
  },
  cargo(text) {
    const j = parseJsonStream(text).find((x) => x && x.vulnerabilities);
    if (!j) return null;
    const items = (j.vulnerabilities.list || []).map((v) => ({ pkg: `${v.package?.name}@${v.package?.version}`, severity: v.advisory?.severity || 'unknown', id: v.advisory?.id || '', title: v.advisory?.title || '', fix: (v.versions?.patched || []).length ? `patched ${(v.versions.patched).join(' | ')}` : 'no patched version' }));
    for (const [kind, arr] of Object.entries(j.warnings || {})) {
      for (const w of arr || []) items.push({ pkg: `${w.package?.name}@${w.package?.version}`, severity: 'low', id: w.advisory?.id || kind, title: `${kind}${w.advisory?.title ? `: ${w.advisory.title}` : ''}`, fix: '' });
    }
    return finish(items);
  },
  govulncheck(text) {
    const objs = parseJsonStream(text);
    if (!objs.length) return null;
    const osv = new Map();
    for (const o of objs) if (o && o.osv && o.osv.id) osv.set(o.osv.id, o.osv);
    const byId = new Map();
    for (const o of objs) {
      const f = o && o.finding;
      if (!f || !f.osv) continue;
      const t = (f.trace || [])[0] || {};
      const cur = byId.get(f.osv) || { called: false, module: t.module || '', version: t.version || '', fixed: f.fixed_version || '' };
      if (t.function) cur.called = true;
      byId.set(f.osv, cur);
    }
    const items = [...byId.entries()].map(([id, v]) => ({ pkg: `${v.module}@${v.version}`, severity: v.called ? 'high' : 'low', id, title: `${v.called ? 'CALLED by your code' : 'in module graph, not called'}${osv.get(id)?.summary ? ` - ${osv.get(id).summary}` : ''}`, fix: v.fixed ? `fixed in ${v.fixed}` : 'no fix' }));
    return finish(items);
  },
  'pip-audit'(text) {
    const j = parseJsonStream(text).find((x) => x && (Array.isArray(x) || x.dependencies));
    if (!j) return null;
    const deps = Array.isArray(j) ? j : j.dependencies;
    const items = [];
    for (const d of deps || []) for (const v of d.vulns || []) items.push({ pkg: `${d.name}@${d.version}`, severity: 'unknown', id: v.id + ((v.aliases || []).length ? ` (${v.aliases.slice(0, 2).join(', ')})` : ''), title: (v.description || '').slice(0, 100), fix: (v.fix_versions || []).length ? `fix ${v.fix_versions.join(', ')}` : 'no fix' });
    return finish(items);
  },
  composer(text) {
    const j = parseJsonStream(text).find((x) => x && !Array.isArray(x) && 'advisories' in x);
    if (!j) return null;
    const items = [];
    const adv = j.advisories && !Array.isArray(j.advisories) ? j.advisories : {};
    for (const [pkg, list] of Object.entries(adv)) for (const a of Object.values(list || {})) items.push({ pkg, severity: a.severity || 'unknown', id: a.cve || a.advisoryId || '', title: a.title || '', fix: a.affectedVersions ? `affected ${a.affectedVersions}` : '' });
    for (const [pkg, repl] of Object.entries(j.abandoned || {})) items.push({ pkg, severity: 'low', id: 'abandoned', title: 'abandoned package', fix: repl ? `use ${repl}` : 'no replacement named' });
    return finish(items);
  },
  dotnet(text) {
    const j = parseJsonStream(text).find((x) => x && x.projects);
    if (!j) return null;
    const items = [];
    for (const p of j.projects || []) for (const fw of p.frameworks || []) {
      for (const kind of ['topLevelPackages', 'transitivePackages']) for (const pk of fw[kind] || []) for (const v of pk.vulnerabilities || []) {
        items.push({ pkg: `${pk.id}@${pk.resolvedVersion}`, severity: v.severity, id: (v.advisoryurl || '').split('/').pop(), title: `${kind === 'topLevelPackages' ? 'direct' : 'transitive'} (${fw.framework})`, fix: '' });
      }
    }
    return finish(items);
  },
  osv(text) {
    const j = parseJsonStream(text).find((x) => x && x.results);
    if (!j) return null;
    const items = [];
    for (const r of j.results || []) for (const p of r.packages || []) {
      const sevOf = (id) => { const g = (p.groups || []).find((x) => (x.ids || []).includes(id)); const s = g && Number.parseFloat(g.max_severity); return Number.isFinite(s) ? (s >= 9 ? 'critical' : s >= 7 ? 'high' : s >= 4 ? 'moderate' : 'low') : 'unknown'; };
      for (const v of p.vulnerabilities || []) items.push({ pkg: `${p.package?.name}@${p.package?.version} (${p.package?.ecosystem})`, severity: sevOf(v.id), id: v.id, title: (v.summary || '').slice(0, 100), fix: '' });
    }
    return finish(items);
  },
  'bundle-audit'(text) {
    const items = [];
    const blocks = text.split(/\r?\n\r?\n/);
    for (const b of blocks) {
      const name = /Name:\s*(\S+)/.exec(b); if (!name) continue;
      items.push({ pkg: `${name[1]}@${(/Version:\s*(\S+)/.exec(b) || [])[1] || '?'}`, severity: ((/Criticality:\s*(\S+)/.exec(b) || [])[1] || 'unknown'), id: ((/(?:CVE|GHSA|Advisory):\s*(\S+)/.exec(b) || [])[1] || ''), title: ((/Title:\s*(.+)/.exec(b) || [])[1] || '').trim(), fix: ((/Solution:\s*(.+)/.exec(b) || [])[1] || '').trim() });
    }
    return finish(items);
  },
  exit() { return null; },
};

const ERROR_HINTS = /(ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|getaddrinfo|network|could not resolve|unable to (?:access|connect)|not found|No such file|is not recognized|command not found|ENOLOCK|requires an existing lockfile|could not be found|error: no such (?:sub)?command|Unknown command|unrecognized|No assets file|Run a NuGet package restore)/i;

function runCmd(cmd, cwd, timeoutSec) {
  const t0 = Date.now();
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', timeout: timeoutSec * 1000, maxBuffer: 128 * 1024 * 1024, windowsHide: true,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: process.env.CI || '1' } });
  return { code: r.status, signal: r.signal, timedOut: !!(r.error && r.error.code === 'ETIMEDOUT'), out: stripAnsi(r.stdout), err: stripAnsi(r.stderr), ms: Date.now() - t0 };
}

export function classify(step, res) {
  const text = `${res.out}\n${res.err}`;
  if (res.timedOut) return { status: 'ERROR', reason: `timed out after ${Math.round(res.ms / 1000)}s` };
  const parsed = PARSERS[step.parser] ? PARSERS[step.parser](res.out) || PARSERS[step.parser](text) : null;
  if (parsed && parsed.count > 0) return { status: 'ISSUES', parsed };
  if (parsed && parsed.count === 0) return res.code === 0 ? { status: 'CLEAN', parsed } : { status: 'ERROR', reason: `exit ${res.code} but no advisories parsed - read the raw output` };
  if (res.code === 0) return { status: 'CLEAN' };
  if (step.cmd.startsWith('mix deps.audit') && /could not be found|task .* not found/i.test(text)) return { status: 'SKIP', reason: 'mix_audit not installed' };
  if (ERROR_HINTS.test(text) && !/vulnerab|advisor|insecure|Unpatched/i.test(text)) return { status: 'ERROR', reason: (text.split(/\r?\n/).find((l) => ERROR_HINTS.test(l)) || '').trim().slice(0, 200) };
  return { status: 'ISSUES', reason: 'non-zero exit (see output)' };
}

function parseArgs(argv) {
  const o = { target: null, list: false, only: null, prod: false, osv: true, timeout: 300, depth: 3, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--list') o.list = true;
    else if (a === '--only') { o.only = need().split(',').map((s) => s.trim()).filter(Boolean); const bad = o.only.filter((e) => !ECOS.includes(e)); if (bad.length) throw new Error(`unknown ecosystem: ${bad.join(',')}`); }
    else if (a === '--prod') o.prod = true;
    else if (a === '--no-osv') o.osv = false;
    else if (a === '--timeout') { o.timeout = Number.parseInt(need(), 10); if (!(o.timeout > 0)) throw new Error('--timeout must be a positive integer'); }
    else if (a === '--depth') { o.depth = Number.parseInt(need(), 10); if (!(o.depth >= 0)) throw new Error('--depth must be >= 0'); }
    else if (a === '--json') o.json = true;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else if (!o.target) o.target = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  return o;
}

function stateDir(base) {
  let d = base;
  for (let i = 0; i < 6; i++) { if (fs.existsSync(path.join(d, '.agents'))) return path.join(d, '.agents', '.state', 'security', 'dep-audit'); const up = path.dirname(d); if (up === d) break; d = up; }
  return null;
}

export function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(`dep-audit: ${e.message}\n\n${HELP}`); return 2; }
  if (o.help) { console.log(HELP); return 0; }
  const base = path.resolve(o.target || '.');
  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) { console.error(`dep-audit: not a directory: ${base}`); return 2; }
  const rel = (d) => path.relative(base, d).split(path.sep).join('/') || '.';
  let steps = findRoots(base, o.depth).flatMap((r) => planRoot(r, o));
  if (o.osv && hasTool('osv-scanner')) steps.push({ eco: 'osv', root: base, tool: 'osv-scanner', cmd: 'osv-scanner scan source -r . --format json', parser: 'osv', hint: 'v1 syntax: `osv-scanner -r .`' });
  if (o.only) steps = steps.filter((s) => o.only.includes(s.eco));
  for (const s of steps) if (!s.status && s.tool && !hasTool(s.tool)) { s.status = 'SKIP'; s.reason = `${s.tool} not installed`; }

  if (o.list) {
    if (o.json) console.log(JSON.stringify(steps.map((s) => ({ eco: s.eco, root: rel(s.root), cmd: s.cmd || null, status: s.status || 'RUN', reason: s.reason || '', hint: s.hint || '', note: s.note || '' })), null, 2));
    else {
      if (!steps.length) console.log('DEP-AUDIT PLAN: no supported manifests found');
      for (const s of steps) console.log(`${(s.status || 'RUN').padEnd(6)} ${s.eco.padEnd(7)} ${rel(s.root)}  ${s.cmd ? `\`${s.cmd}\`` : ''}${s.reason ? ` - ${s.reason}` : ''}${s.hint && s.status ? ` (${s.hint})` : ''}${s.note ? ` [${s.note}]` : ''}`);
    }
    return 0;
  }

  const sdir = stateDir(base);
  if (sdir) { try { fs.mkdirSync(sdir, { recursive: true }); } catch { /* optional */ } }
  const results = [];
  steps.forEach((s, idx) => {
    const r = { eco: s.eco, root: rel(s.root), cmd: s.cmd || null, status: s.status || null, reason: s.reason || '', hint: s.hint || '', note: s.note || '', secs: 0, count: 0, counts: {}, items: [], output: null };
    if (!r.status) {
      let cmd = s.cmd;
      if (s.pre === 'uv-export') {
        const reqFile = path.join(sdir || s.root, `uv-requirements-${idx}.txt`);
        const ex = runCmd(`uv export --format requirements-txt --no-hashes --frozen${o.prod ? ' --no-dev' : ''} -o "${reqFile}"`, s.root, o.timeout);
        if (ex.code !== 0) { r.status = 'ERROR'; r.reason = `uv export failed: ${(ex.err || ex.out).trim().split(/\r?\n/)[0]}`; results.push(r); return; }
        try { const t = readText(reqFile).split(/\r?\n/).filter((l) => !/^\s*(-e\s|\.|file:)/.test(l)).join('\n'); fs.writeFileSync(reqFile, t); } catch { /* keep as is */ }
        cmd = cmd.replace('{UVREQ}', `"${reqFile}"`);
        r.cmd = cmd;
      }
      const res = runCmd(cmd, s.root, o.timeout);
      r.secs = Math.round(res.ms / 100) / 10;
      const c = classify(s, res);
      r.status = c.status; r.reason = c.reason || '';
      if (c.parsed) { r.count = c.parsed.count; r.counts = c.parsed.counts; r.items = c.parsed.items; }
      const raw = `$ ${cmd}\n(exit ${res.code})\n${res.out}\n${res.err ? `--- stderr ---\n${res.err}` : ''}`;
      if (sdir) {
        const f = path.join(sdir, `${idx + 1}-${s.eco}-${(rel(s.root) === '.' ? 'root' : rel(s.root)).replace(/[^A-Za-z0-9_.-]+/g, '_')}.txt`);
        try { fs.writeFileSync(f, raw); r.output = path.relative(process.cwd(), f).split(path.sep).join('/'); } catch { /* optional */ }
      }
      if (!c.parsed || r.status === 'ERROR') r.tail = `${res.out}\n${res.err}`.trim().split(/\r?\n/).slice(-15).join('\n');
    }
    results.push(r);
  });

  const issues = results.filter((r) => r.status === 'ISSUES');
  const errors = results.filter((r) => r.status === 'ERROR');
  const skipped = results.filter((r) => r.status === 'SKIP' || r.status === 'MANUAL');
  const vulnTotal = issues.reduce((n, r) => n + (r.count || 0), 0);
  const final = errors.length && !issues.length ? `DEP-AUDIT: ERROR (${errors.length} failed to run; ${skipped.length} skipped)`
    : issues.length ? `DEP-AUDIT: ISSUES (${vulnTotal || 'unparsed'} findings in ${issues.length} audit${issues.length > 1 ? 's' : ''}; ${errors.length} errors; ${skipped.length} skipped)`
      : `DEP-AUDIT: CLEAN (${results.length - skipped.length} audited; ${skipped.length} skipped)`;
  if (sdir) {
    try { fs.writeFileSync(path.join(sdir, 'summary.json'), JSON.stringify({ ts: Date.now(), base: base.split(path.sep).join('/'), final, results }, null, 2)); } catch { /* optional */ }
  }

  if (o.json) console.log(JSON.stringify({ final, results }, null, 2));
  else {
    if (!results.length) console.log('No supported manifests found (see --help for the list of ecosystems).');
    for (const r of results) {
      const counts = Object.entries(r.counts).map(([k, v]) => `${v} ${k}`).join(', ');
      console.log(`${r.status.padEnd(6)} ${r.eco}:${r.root} (${r.secs}s)${r.cmd ? ` - ${r.cmd}` : ''}${counts ? ` -> ${counts}` : ''}${r.reason ? ` - ${r.reason}` : ''}`);
      if (r.note) console.log(`       note: ${r.note}`);
      if ((r.status === 'SKIP' || r.status === 'MANUAL' || r.status === 'ERROR') && r.hint) console.log(`       hint: ${r.hint}`);
      const order = (x) => ['critical', 'high', 'moderate', 'low', 'info', 'unknown'].indexOf(x.severity);
      for (const it of [...r.items].sort((a, b) => order(a) - order(b)).slice(0, 15)) console.log(`       - ${it.severity.padEnd(8)} ${it.pkg} ${it.id ? `[${it.id}] ` : ''}${it.title}${it.fix ? ` (${it.fix})` : ''}`);
      if (r.items.length > 15) console.log(`       ... ${r.items.length - 15} more in ${r.output || 'the raw output'}`);
      if (r.tail && r.status !== 'CLEAN') console.log(r.tail.split('\n').map((l) => `       | ${l.slice(0, 200)}`).join('\n'));
      if (r.output && r.status !== 'SKIP') console.log(`       raw: ${r.output}`);
    }
    console.log(final);
  }
  return issues.length || errors.length ? 1 : 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  let code = 2;
  try { code = main(process.argv.slice(2)); } catch (e) { console.error(`dep-audit: internal error: ${e && e.message}`); code = 2; }
  process.exitCode = code;
}
