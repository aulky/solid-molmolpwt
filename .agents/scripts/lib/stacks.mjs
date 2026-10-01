// Stack, package-manager and framework detection shared by verify.mjs and activate-stack.mjs
// (.agents/docs/architecture.md). Node >= 18, ESM, builtins only. All readers are non-throwing.
import fs from 'node:fs';
import path from 'node:path';

/** Directory names skipped everywhere. `.agents/.state` is a path, see IGNORE_PATHS. */
export const IGNORE_DIRS = [
  '.git', 'node_modules', 'dist', 'build', 'out', '.output', '.next', '.nuxt', '.svelte-kit', '.vinxi',
  'target', 'vendor', '.venv', 'venv', '__pycache__', 'coverage', '.turbo', '.cache', '.gradle', 'bin', 'obj',
  '.dart_tool', '.scratch',
];
export const IGNORE_PATHS = ['.agents/.state'];
const IGNORE_SET = new Set(IGNORE_DIRS);
// Project-root detection additionally skips dot-directories (the kit itself lives in .agents/) and fixture dirs.
const ROOT_EXTRA_SKIP = new Set(['testdata', 'fixtures', '__fixtures__']);

/** Stack ids in display/run order. */
export const STACKS = [
  'node', 'deno', 'python', 'go', 'rust', 'php', 'ruby', 'jvm', 'dotnet', 'dart', 'elixir', 'swift', 'cpp', 'agent-kit',
];
const ALIASES = {
  js: 'node', ts: 'node', javascript: 'node', typescript: 'node', bun: 'node', npm: 'node', pnpm: 'node', yarn: 'node',
  py: 'python', golang: 'go', rs: 'rust', cargo: 'rust', composer: 'php', laravel: 'php', rb: 'ruby', rails: 'ruby',
  java: 'jvm', kotlin: 'jvm', maven: 'jvm', gradle: 'jvm', csharp: 'dotnet', cs: 'dotnet', net: 'dotnet', '.net': 'dotnet',
  fsharp: 'dotnet', flutter: 'dart', ex: 'elixir', mix: 'elixir', c: 'cpp', 'c++': 'cpp', 'c-cpp': 'cpp', cmake: 'cpp',
  kit: 'agent-kit', agents: 'agent-kit',
};

/** Map a user token (e.g. "ts", "golang", "kit") to a stack id, or null. */
export function resolveStackId(token) {
  const t = String(token || '').trim().toLowerCase();
  if (STACKS.includes(t)) return t;
  return ALIASES[t] || null;
}

export const toPosix = (p) => String(p).replace(/\\/g, '/');

export function exists(p) {
  try { fs.statSync(p); return true; } catch { return false; }
}

export function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

/** Read a text file (≤ maxBytes, default 2 MB); '' when missing/unreadable/too large. */
export function readText(p, maxBytes = 2 * 1024 * 1024) {
  try {
    if (fs.statSync(p).size > maxBytes) return '';
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

/** Remove // and block comments plus trailing commas (JSONC). String-aware. */
export function stripJsonComments(text) {
  let out = ''; let i = 0; let inStr = false;
  const s = String(text);
  while (i < s.length) {
    const c = s[i]; const n = s[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += n || ''; i += 2; continue; }
      if (c === '"') inStr = false;
      i += 1;
    } else if (c === '"') { inStr = true; out += c; i += 1; }
    else if (c === '/' && n === '/') { while (i < s.length && s[i] !== '\n') i += 1; }
    else if (c === '/' && n === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i += 1; i += 2; }
    else { out += c; i += 1; }
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/** Parse JSON/JSONC; returns undefined when missing, null when present but invalid. */
export function readJson(p) {
  if (!exists(p)) return undefined;
  const raw = readText(p).replace(/^﻿/, '');
  try { return JSON.parse(raw); } catch { /* try JSONC */ }
  try { return JSON.parse(stripJsonComments(raw)); } catch { return null; }
}

const PY_MANIFESTS = ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile'];
const JVM_MANIFESTS = ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'];

/** Stack ids implied by the file names present in one directory. */
export function stacksForFiles(files) {
  const has = (f) => files.includes(f);
  const s = [];
  if (has('package.json')) s.push('node');
  else if (has('deno.json') || has('deno.jsonc')) s.push('deno');
  if (PY_MANIFESTS.some(has)) s.push('python');
  if (has('go.mod')) s.push('go');
  if (has('Cargo.toml')) s.push('rust');
  if (has('composer.json')) s.push('php');
  if (has('Gemfile')) s.push('ruby');
  if (JVM_MANIFESTS.some(has)) s.push('jvm');
  if (files.some((f) => /\.(sln|slnx|csproj|fsproj|vbproj)$/i.test(f))) s.push('dotnet');
  if (has('pubspec.yaml')) s.push('dart');
  if (has('mix.exs')) s.push('elixir');
  if (has('Package.swift')) s.push('swift');
  if (has('CMakeLists.txt')) s.push('cpp');
  return s;
}

/**
 * Breadth-first walk from repoRoot (depth 0) to maxDepth, returning every directory that holds a manifest:
 * [{ dir (abs), rel ('.' or 'a/b'), depth, files: [names], stacks: [ids] }]. Skips IGNORE_DIRS,
 * dot-directories, fixture dirs and symlinked directories.
 */
export function findManifestDirs(repoRoot, maxDepth = 3) {
  const out = [];
  const queue = [{ dir: path.resolve(repoRoot), rel: '.', depth: 0 }];
  while (queue.length) {
    const cur = queue.shift();
    let ents;
    try { ents = fs.readdirSync(cur.dir, { withFileTypes: true }); } catch { continue; }
    const files = ents.filter((e) => e.isFile()).map((e) => e.name).sort();
    const stacks = stacksForFiles(files);
    if (stacks.length) out.push({ dir: cur.dir, rel: cur.rel, depth: cur.depth, files, stacks });
    if (cur.depth >= maxDepth) continue;
    const subdirs = ents
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !IGNORE_SET.has(e.name) && !ROOT_EXTRA_SKIP.has(e.name))
      .map((e) => e.name).sort();
    for (const name of subdirs) {
      const rel = cur.rel === '.' ? name : `${cur.rel}/${name}`;
      if (IGNORE_PATHS.includes(rel)) continue;
      queue.push({ dir: path.join(cur.dir, name), rel, depth: cur.depth + 1 });
    }
  }
  return out;
}

function isAncestorRel(a, b) {
  if (a === b) return false;
  return a === '.' || b.startsWith(`${a}/`);
}

function coveredByAncestor(stack, ancestors) {
  const txt = (a, f) => readText(path.join(a.dir, f));
  switch (stack) {
    case 'rust':
      return ancestors.some((a) => a.files.includes('Cargo.toml') && /^\s*\[workspace\]/m.test(txt(a, 'Cargo.toml')));
    case 'dotnet':
      return ancestors.some((a) => a.files.some((f) => /\.slnx?$/i.test(f)));
    case 'jvm':
      return ancestors.some((a) => a.files.some((f) => /^settings\.gradle(\.kts)?$/.test(f))
        || (a.files.includes('pom.xml') && /<modules>/.test(txt(a, 'pom.xml'))));
    case 'cpp':
      return ancestors.some((a) => a.files.includes('CMakeLists.txt'));
    case 'elixir':
      return ancestors.some((a) => a.files.includes('mix.exs') && /apps_path/.test(txt(a, 'mix.exs')));
    default:
      return false;
  }
}

/**
 * Project roots for verification: manifest dirs minus stacks already covered by an ancestor build
 * (cargo workspace, .sln, gradle settings / maven <modules>, parent CMakeLists, mix umbrella).
 */
export function projectRoots(dirs) {
  const res = [];
  for (const d of dirs) {
    const ancestors = dirs.filter((a) => isAncestorRel(a.rel, d.rel));
    const stacks = d.stacks.filter((s) => !coveredByAncestor(s, ancestors));
    if (stacks.length) res.push({ ...d, stacks });
  }
  return res;
}

const LOCKFILES = [
  ['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'], ['npm-shrinkwrap.json', 'npm'],
];

function isInside(child, parent) {
  const r = path.relative(parent, child);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}

/**
 * Package manager for a node project: nearest lockfile walking up from `dir` to `stopDir`
 * (bun.lock/bun.lockb → bun, pnpm-lock.yaml → pnpm, yarn.lock → yarn, package-lock.json → npm; per directory
 * in that order), then a `packageManager` field, else npm. Returns { pm, source }.
 */
export function detectPackageManager(dir, stopDir = dir) {
  const stop = path.resolve(stopDir);
  let d = path.resolve(dir);
  let field = null;
  for (let guard = 0; guard < 64; guard += 1) {
    for (const [file, pm] of LOCKFILES) {
      if (exists(path.join(d, file))) return { pm, source: toPosix(path.relative(stop, path.join(d, file))) || file };
    }
    if (!field) {
      const pkg = readJson(path.join(d, 'package.json'));
      const m = pkg && typeof pkg.packageManager === 'string' ? /^(npm|pnpm|yarn|bun)@/.exec(pkg.packageManager) : null;
      if (m) field = m[1];
    }
    const parent = path.dirname(d);
    if (parent === d || !isInside(parent, stop) || !isInside(d, stop) || path.relative(stop, d) === '') break;
    d = parent;
  }
  if (field) return { pm: field, source: 'packageManager field' };
  return { pm: 'npm', source: 'default (no lockfile)' };
}

/** Framework ids in canonical order (each maps to rules/fw-<id>.md). */
export const FRAMEWORK_IDS = [
  'solidjs', 'solid-start', 'react', 'nextjs', 'vue-nuxt', 'sveltekit', 'angular', 'astro', 'tailwind', 'node-server',
  'react-native', 'flutter', 'django', 'fastapi', 'laravel', 'spring-boot', 'aspnet-core', 'rails', 'phoenix',
  'rust-web', 'go-web', 'remotion',
];
const NODE_SERVER_DEPS = ['express', 'fastify', 'hono', 'h3', 'nitro', 'nitropack', 'koa', '@nestjs/core', 'elysia'];

function pyWord(name) {
  return new RegExp(`(^|[^A-Za-z0-9_.-])${name}([^A-Za-z0-9_.-]|$)`, 'im');
}

function goUsesNetHttp(rootDir, budget) {
  const stack = [{ dir: rootDir, depth: 0 }];
  while (stack.length && budget.files > 0) {
    const { dir, depth } = stack.pop();
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (e.isDirectory()) {
        if (depth < 6 && !e.name.startsWith('.') && !IGNORE_SET.has(e.name) && e.name !== 'testdata') {
          stack.push({ dir: path.join(dir, e.name), depth: depth + 1 });
        }
      } else if (e.isFile() && e.name.endsWith('.go')) {
        budget.files -= 1;
        if (readText(path.join(dir, e.name), 256 * 1024).includes('"net/http"')) return `${e.name} imports net/http`;
        if (budget.files <= 0) break;
      }
    }
  }
  return null;
}

/**
 * Detect frameworks from manifests in `dirs` (output of findManifestDirs). Returns
 * { ids: [framework ids in FRAMEWORK_IDS order], evidence: { id: ["<rel>/<manifest>: <why>", ...] } }.
 */
export function detectFrameworks(dirs, { scanGoSources = true } = {}) {
  const found = new Map();
  const add = (id, ev) => {
    if (!found.has(id)) found.set(id, []);
    const list = found.get(id);
    if (list.length < 4 && !list.includes(ev)) list.push(ev);
  };
  const goDirs = [];
  for (const d of dirs) {
    const pre = d.rel === '.' ? '' : `${d.rel}/`;
    const has = (f) => d.files.includes(f);
    const text = (f) => readText(path.join(d.dir, f));

    if (has('package.json')) {
      const pkg = readJson(path.join(d.dir, 'package.json')) || {};
      const deps = new Set();
      for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        if (pkg[k] && typeof pkg[k] === 'object') for (const n of Object.keys(pkg[k])) deps.add(n);
      }
      const dep = (id, ...names) => {
        const n = names.find((x) => deps.has(x));
        if (n) add(id, `${pre}package.json: ${n}`);
      };
      dep('solidjs', 'solid-js');
      dep('solid-start', '@solidjs/start');
      if (deps.has('react') && !deps.has('solid-js')) add('react', `${pre}package.json: react`);
      dep('nextjs', 'next');
      dep('vue-nuxt', 'vue', 'nuxt');
      dep('sveltekit', 'svelte', '@sveltejs/kit');
      dep('angular', '@angular/core');
      dep('astro', 'astro');
      dep('tailwind', 'tailwindcss', '@tailwindcss/vite', '@tailwindcss/postcss', '@tailwindcss/cli');
      dep('node-server', ...NODE_SERVER_DEPS);
      dep('react-native', 'react-native', 'expo');
      const rem = deps.has('remotion') ? 'remotion' : [...deps].find((n) => n.startsWith('@remotion/'));
      if (rem) add('remotion', `${pre}package.json: ${rem}`);
    }
    if (has('pubspec.yaml')) {
      const t = text('pubspec.yaml');
      if (/^\s*flutter\s*:/m.test(t) || /sdk:\s*flutter/.test(t)) add('flutter', `${pre}pubspec.yaml: flutter`);
    }
    const pyFiles = d.files.filter((f) => PY_MANIFESTS.includes(f) || /^requirements.*\.txt$/i.test(f));
    for (const f of pyFiles) {
      const t = text(f);
      if (pyWord('django').test(t)) add('django', `${pre}${f}: django`);
      const m = /(^|[^A-Za-z0-9_.-])(fastapi|flask)([^A-Za-z0-9_.-]|$)/im.exec(t);
      if (m) add('fastapi', `${pre}${f}: ${m[2].toLowerCase()}`);
    }
    if (has('composer.json')) {
      const c = readJson(path.join(d.dir, 'composer.json')) || {};
      if ((c.require && c.require['laravel/framework']) || (c['require-dev'] && c['require-dev']['laravel/framework'])) {
        add('laravel', `${pre}composer.json: laravel/framework`);
      }
    }
    for (const f of d.files.filter((x) => JVM_MANIFESTS.includes(x))) {
      if (/spring-boot/.test(text(f))) add('spring-boot', `${pre}${f}: spring-boot`);
    }
    for (const f of d.files.filter((x) => /\.csproj$/i.test(x))) {
      const t = text(f);
      if (/Sdk\s*=\s*"Microsoft\.NET\.Sdk\.(Web|Razor|BlazorWebAssembly)"/i.test(t)
        || /Include\s*=\s*"Microsoft\.AspNetCore\.App"/i.test(t)) add('aspnet-core', `${pre}${f}: ASP.NET Core SDK`);
    }
    if (has('Gemfile') && /^\s*gem\s+["']rails["']/m.test(text('Gemfile'))) add('rails', `${pre}Gemfile: rails`);
    if (has('mix.exs') && /\{\s*:phoenix\s*,/.test(text('mix.exs'))) add('phoenix', `${pre}mix.exs: :phoenix`);
    if (has('Cargo.toml')) {
      const t = text('Cargo.toml');
      const m = /^\s*(axum|actix-web|rocket|tokio)\s*=/m.exec(t) || /^\s*\[[\w.-]*dependencies\.(axum|actix-web|rocket|tokio)\]/m.exec(t);
      if (m) add('rust-web', `${pre}Cargo.toml: ${m[1]}`);
    }
    if (has('go.mod')) {
      const m = /github\.com\/(go-chi\/chi|gin-gonic\/gin|labstack\/echo|gofiber\/fiber)/.exec(text('go.mod'));
      if (m) add('go-web', `${pre}go.mod: ${m[1]}`);
      else goDirs.push(d);
    }
  }
  if (scanGoSources && !found.has('go-web')) {
    const budget = { files: 2000 };
    for (const d of goDirs) {
      const hit = goUsesNetHttp(d.dir, budget);
      if (hit) { add('go-web', `${d.rel === '.' ? '' : `${d.rel}/`}${hit}`); break; }
    }
  }
  const ids = FRAMEWORK_IDS.filter((id) => found.has(id));
  return { ids, evidence: Object.fromEntries(ids.map((id) => [id, found.get(id)])) };
}
