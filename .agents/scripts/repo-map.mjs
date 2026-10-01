#!/usr/bin/env node
// repo-map.mjs: compact repository overview for agents (stacks, package manager, manifests, scripts,
// entry points, tests, tree with file counts, notable config). Writes .agents/.state/repo-map.json.
// Zero dependencies, Node >= 18.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { walk, toPosix, isIgnoredDir, compileGlob } from './lib/walk.mjs';

const USAGE = `Usage: node .agents/scripts/repo-map.mjs [--depth <n>] [--json] [--root <dir>]

Print a compact overview of the repository: detected stacks and project roots, package manager,
manifests, scripts/tasks, frameworks, entry points, test locations, a directory tree with file
counts, and notable config files. Also writes .agents/.state/repo-map.json.

Options:
  --depth <n>   tree depth and max depth for project roots (default 3)
  --json        print the full JSON instead of the text summary
  --root <dir>  repository to map (default: the repo that contains this .agents/ folder)
  -h, --help    show this help
Exit code: 0 = ok, 2 = usage or internal error.
`;

const MAX_ENTRIES = 200000;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const MANIFESTS = {
  'package.json': 'node', 'deno.json': 'deno', 'deno.jsonc': 'deno', 'Cargo.toml': 'rust', 'go.mod': 'go',
  'pyproject.toml': 'python', 'requirements.txt': 'python', 'setup.py': 'python', 'Pipfile': 'python',
  'composer.json': 'php', 'pom.xml': 'jvm', 'build.gradle': 'jvm', 'build.gradle.kts': 'jvm', 'Gemfile': 'ruby',
  'pubspec.yaml': 'dart', 'mix.exs': 'elixir', 'Package.swift': 'swift', 'CMakeLists.txt': 'c-cpp',
  'build.zig': 'zig', 'stack.yaml': 'haskell', 'build.sbt': 'scala',
};
const MANIFEST_EXT = { '.csproj': 'dotnet', '.fsproj': 'dotnet', '.sln': 'dotnet', '.cabal': 'haskell' };
const LOCKFILES = {
  'bun.lock': 'bun', 'bun.lockb': 'bun', 'pnpm-lock.yaml': 'pnpm', 'yarn.lock': 'yarn', 'package-lock.json': 'npm',
  'npm-shrinkwrap.json': 'npm', 'deno.lock': 'deno', 'Cargo.lock': 'cargo', 'go.sum': 'go', 'uv.lock': 'uv',
  'poetry.lock': 'poetry', 'Pipfile.lock': 'pipenv', 'pdm.lock': 'pdm', 'composer.lock': 'composer',
  'Gemfile.lock': 'bundler', 'pubspec.lock': 'pub', 'mix.lock': 'mix', 'Package.resolved': 'swiftpm',
};
const NODE_PM_ORDER = ['bun', 'pnpm', 'yarn', 'npm'];

// Frameworks/tools by dependency name (node) -> kit framework id (fw-*.md) or tool label.
const NODE_FW = {
  'solid-js': 'solidjs', '@solidjs/start': 'solid-start', react: 'react', next: 'nextjs', vue: 'vue-nuxt',
  nuxt: 'vue-nuxt', svelte: 'sveltekit', '@sveltejs/kit': 'sveltekit', '@angular/core': 'angular', astro: 'astro',
  tailwindcss: 'tailwind', '@tailwindcss/vite': 'tailwind', express: 'node-server', fastify: 'node-server',
  hono: 'node-server', h3: 'node-server', nitro: 'node-server', nitropack: 'node-server', koa: 'node-server',
  '@nestjs/core': 'node-server', elysia: 'node-server', 'react-native': 'react-native', expo: 'react-native',
  remotion: 'remotion',
};
const NODE_TOOLS = [
  'typescript', 'vite', 'vitest', 'jest', '@playwright/test', 'playwright', 'cypress', '@biomejs/biome', 'eslint',
  'prettier', 'prisma', '@prisma/client', 'drizzle-orm', '@solidjs/router', 'turbo', 'nx', 'webpack', 'esbuild',
];
const TEXT_FW = [
  // [stack, regex over manifest text, id]
  ['python', /(^|[\s"'\[,])django([\s"'<>=~!;,\[\]]|$)/im, 'django'],
  ['python', /(^|[\s"'\[,])fastapi([\s"'<>=~!;,\[\]]|$)/im, 'fastapi'],
  ['python', /(^|[\s"'\[,])flask([\s"'<>=~!;,\[\]]|$)/im, 'fastapi'],
  ['php', /"laravel\/framework"/, 'laravel'],
  ['rust', /^\s*(axum|actix-web|rocket|tokio)\s*[=.]/m, 'rust-web'],
  ['go', /github\.com\/(gin-gonic\/gin|labstack\/echo|go-chi\/chi|gofiber\/fiber)/, 'go-web'],
  ['ruby', /^\s*gem\s+["']rails["']/m, 'rails'],
  ['elixir', /:phoenix\b/, 'phoenix'],
  ['dart', /^flutter:/m, 'flutter'],
  ['jvm', /spring-boot/, 'spring-boot'],
  ['dotnet', /Microsoft\.NET\.Sdk\.Web/, 'aspnet-core'],
];

const TEST_DIRS = new Set(['test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'cypress', 'integration_test', 'testing']);
const TEST_FILE_GLOBS = [
  '*.test.*', '*.spec.*', 'test_*.py', '*_test.py', '*_test.go', '*Test.java', '*Tests.java', '*Test.kt',
  '*Tests.cs', '*Test.cs', '*_spec.rb', '*_test.rb', '*_test.exs', '*_test.dart', '*Test.php', '*.test.php',
].map((g) => compileGlob(g, { nocase: false }));
const TEST_CONFIG_GLOBS = [
  'vitest.config.*', 'vitest.workspace.*', 'jest.config.*', 'playwright.config.*', 'cypress.config.*',
  'karma.conf.*', 'pytest.ini', 'conftest.py', 'tox.ini', 'phpunit.xml', 'phpunit.xml.dist', '.rspec',
].map((g) => compileGlob(g, { nocase: false }));
const CONFIG_GLOBS = [
  'tsconfig*.json', 'jsconfig.json', 'vite.config.*', 'app.config.*', 'next.config.*', 'nuxt.config.*',
  'svelte.config.*', 'astro.config.*', 'angular.json', 'tailwind.config.*', 'postcss.config.*', 'biome.json',
  'biome.jsonc', '.eslintrc*', 'eslint.config.*', '.prettierrc*', 'prettier.config.*', '.editorconfig',
  'Dockerfile', 'Dockerfile.*', 'docker-compose*.yml', 'docker-compose*.yaml', 'compose.yml', 'compose.yaml',
  '.gitlab-ci.yml', 'azure-pipelines.yml', 'Jenkinsfile', '.env', '.env.*', '.nvmrc', '.node-version',
  '.tool-versions', '.python-version', 'rust-toolchain', 'rust-toolchain.toml', 'global.json', 'turbo.json',
  'nx.json', 'pnpm-workspace.yaml', 'lerna.json', 'go.work', 'wrangler.toml', 'wrangler.json', 'wrangler.jsonc',
  'vercel.json', 'netlify.toml', 'fly.toml', 'Procfile', 'renovate.json', 'Makefile', 'justfile', 'Taskfile.yml',
  'AGENTS.md', 'GEMINI.md', 'CLAUDE.md', '.cursorrules', 'README.md', 'CONTRIBUTING.md', 'CHANGELOG.md',
  'LICENSE', 'LICENSE.*', 'skills-lock.json', 'ruff.toml', 'mypy.ini', 'phpstan.neon', 'pint.json',
  'rustfmt.toml', 'clippy.toml', '.golangci.yml', '.rubocop.yml', 'analysis_options.yaml',
].map((g) => compileGlob(g, { nocase: false }));
const ENTRY_GLOBS = [
  'src/main.*', 'src/index.*', 'src/app.*', 'src/App.*', 'src/entry-client.*', 'src/entry-server.*',
  'src/server.*', 'server.*', 'index.js', 'index.ts', 'index.mjs', 'index.html', 'main.go', 'cmd/*/main.go',
  'src/main.rs', 'src/lib.rs', 'src/bin/*.rs', 'main.py', 'app.py', 'manage.py', 'wsgi.py', 'asgi.py',
  'src/*/__main__.py', 'artisan', 'public/index.php', 'routes/web.php', 'routes/api.php', 'Program.cs',
  'lib/main.dart', 'config/routes.rb', 'app/layout.tsx', 'app/page.tsx', 'src/app/layout.tsx', 'src/app/page.tsx',
  'src/Root.tsx', 'remotion.config.*',
].map((g) => compileGlob(g, { nocase: false }));
// Entry points must be code (or extension-less launchers like `artisan`), not styles or assets.
const ENTRY_EXT = /(^|\/)[^./]+$|\.(ts|tsx|js|jsx|mjs|cjs|mts|vue|svelte|astro|html|py|rs|go|php|cs|dart|rb|ex|exs|java|kt|swift)$/;
const ROUTE_DIRS = ['src/routes', 'src/pages', 'pages', 'app/routes', 'src/app', 'app'];
const SKIP_EXT = new Set(['', '.lock', '.log', '.map', '.ico', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.woff', '.woff2', '.ttf']);

class UsageError extends Error {}

function parseArgs(argv) {
  const o = { depth: 3, json: false, root: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline;
    if (a.startsWith('--') && a.includes('=')) {
      inline = a.slice(a.indexOf('=') + 1);
      a = a.slice(0, a.indexOf('='));
    }
    const value = () => {
      if (inline !== undefined) return inline;
      if (i + 1 >= argv.length) throw new UsageError(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--json') o.json = true;
    else if (a === '--depth') {
      const v = value();
      if (!/^\d+$/.test(v)) throw new UsageError(`--depth needs a non-negative integer, got "${v}"`);
      o.depth = Number(v);
    } else if (a === '--root') o.root = value();
    else throw new UsageError(`unknown argument "${argv[i]}" (see --help)`);
  }
  return o;
}

function defaultRoot() {
  const kitDir = path.resolve(SCRIPT_DIR, '..');
  if (path.basename(kitDir) === '.agents') return path.dirname(kitDir);
  return process.cwd();
}

function readText(abs, max = 2 * 1024 * 1024) {
  try {
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size > max) return '';
    return fs.readFileSync(abs, 'utf8').replace(/^﻿/, '');
  } catch {
    return '';
  }
}

function stripJsonc(s) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const n = s[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i++;
      } else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === '/' && n === '/') {
      while (i < s.length && s[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++;
      i++;
    } else out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function readJson(abs) {
  const t = readText(abs);
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {}
  try {
    return JSON.parse(stripJsonc(t));
  } catch {
    return null;
  }
}

// Minimal TOML: returns Map(sectionName -> { key: rawValue }) for simple `key = value` lines.
function tomlSections(text) {
  const map = new Map();
  let cur = '';
  map.set(cur, {});
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const sec = line.match(/^\[\[?\s*([^\]]+?)\s*\]\]?/);
    if (sec) {
      cur = sec[1];
      if (!map.has(cur)) map.set(cur, {});
      continue;
    }
    const kv = line.match(/^("?[\w.\-]+"?)\s*=\s*(.*)$/);
    if (kv) map.get(cur)[kv[1].replace(/"/g, '')] = kv[2];
  }
  return map;
}

const unquote = (v) => (v || '').trim().replace(/^["']|["']$/g, '');
const clipStr = (s, n) => (s.length > n ? s.slice(0, n - 3) + '...' : s);

function git(args, cwd) {
  try {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (r.error || r.status !== 0) return null;
    return r.stdout;
  } catch {
    return null;
  }
}

function gitInfo(root) {
  const inside = git(['rev-parse', '--is-inside-work-tree'], root);
  if (!inside || inside.trim() !== 'true') return { isRepo: false };
  const branch = (git(['rev-parse', '--abbrev-ref', 'HEAD'], root) || '').trim() || null;
  const status = git(['status', '--porcelain'], root);
  const last = (git(['log', '-1', '--format=%h %s'], root) || '').trim();
  return {
    isRepo: true,
    branch,
    dirty: status === null ? null : status.split('\n').filter(Boolean).length,
    lastCommit: last ? clipStr(last, 80) : null,
  };
}

function nodePm(dirAbs, rootAbs, pkg) {
  const found = [];
  let d = dirAbs;
  for (;;) {
    for (const [f, pm] of Object.entries(LOCKFILES)) {
      if (NODE_PM_ORDER.includes(pm) && fs.existsSync(path.join(d, f))) found.push({ file: f, pm, dir: d });
    }
    if (found.length || d === rootAbs || path.dirname(d) === d) break;
    d = path.dirname(d);
  }
  const pms = [...new Set(found.map((f) => f.pm))].sort((a, b) => NODE_PM_ORDER.indexOf(a) - NODE_PM_ORDER.indexOf(b));
  const declared = typeof pkg?.packageManager === 'string' ? pkg.packageManager.split('@')[0] : null;
  const pm = pms[0] || declared || 'npm';
  return { pm, lockfiles: found.map((f) => toPosix(path.relative(rootAbs, path.join(f.dir, f.file)))), declared };
}

function analyzeRoot(rootAbs, relDir, files, info) {
  const dirAbs = path.join(rootAbs, relDir);
  const r = { path: relDir || '.', stacks: [], manifests: files.slice().sort(), name: null, packageManager: null,
    lockfiles: [], frameworks: [], fw: [], tooling: [], scripts: {}, notes: [] };
  const add = (arr, v) => {
    if (v && !arr.includes(v)) arr.push(v);
  };
  for (const f of files) {
    const stack = MANIFESTS[f] || MANIFEST_EXT[path.extname(f)];
    add(r.stacks, stack);
    const abs = path.join(dirAbs, f);
    if (f === 'package.json') {
      const pkg = readJson(abs) || {};
      r.name = r.name || pkg.name || null;
      const { pm, lockfiles, declared } = nodePm(dirAbs, rootAbs, pkg);
      r.packageManager = pm;
      r.lockfiles.push(...lockfiles);
      if (declared && declared !== pm) info.warnings.push(`${r.path}: package.json packageManager says ${declared} but lockfile says ${pm}`);
      if (pkg.type) r.notes.push(`type: ${pkg.type}`);
      if (pkg.engines && typeof pkg.engines === 'object') {
        r.notes.push('engines: ' + Object.entries(pkg.engines).map(([k, v]) => `${k} ${v}`).join(', '));
      }
      if (pkg.workspaces) {
        const ws = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages || [];
        if (ws.length) r.notes.push('workspaces: ' + ws.join(', '));
      }
      const deps = { ...(pkg.peerDependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.dependencies || {}) };
      for (const [name, ver] of Object.entries(deps)) {
        if (NODE_FW[name]) {
          if (name === 'react' && deps['solid-js']) continue;
          add(r.frameworks, `${name} ${ver}`);
          add(r.fw, NODE_FW[name]);
        } else if (NODE_TOOLS.includes(name)) add(r.tooling, `${name} ${ver}`);
      }
      if (deps.bun || deps['@types/bun'] || r.packageManager === 'bun') add(r.stacks, 'bun');
      for (const [k, v] of Object.entries(pkg.scripts || {})) r.scripts[k] = clipStr(String(v), 90);
    } else if (f === 'deno.json' || f === 'deno.jsonc') {
      const d = readJson(abs) || {};
      for (const [k, v] of Object.entries(d.tasks || {})) r.scripts[`deno task ${k}`] = clipStr(String(v), 90);
      r.packageManager = r.packageManager || 'deno';
    } else if (f === 'composer.json') {
      const c = readJson(abs) || {};
      r.name = r.name || c.name || null;
      for (const k of Object.keys(c.scripts || {})) r.scripts[`composer ${k}`] = '';
      r.packageManager = r.packageManager || 'composer';
    } else if (f === 'Cargo.toml' || f === 'pyproject.toml') {
      const t = tomlSections(readText(abs));
      const pkgSec = t.get('package') || t.get('project') || t.get('tool.poetry') || {};
      r.name = r.name || unquote(pkgSec.name) || null;
      if (f === 'Cargo.toml') {
        r.packageManager = r.packageManager || 'cargo';
        if (t.has('workspace')) r.notes.push('cargo workspace' + (t.get('workspace').members ? `: ${t.get('workspace').members}` : ''));
      } else {
        const lock = ['uv.lock', 'poetry.lock', 'pdm.lock', 'Pipfile.lock'].find((l) => fs.existsSync(path.join(dirAbs, l)));
        r.packageManager = r.packageManager || (lock ? LOCKFILES[lock] : 'pip');
        for (const sec of ['project.scripts', 'tool.poetry.scripts', 'tool.pdm.scripts', 'tool.taskipy.tasks']) {
          for (const [k, v] of Object.entries(t.get(sec) || {})) r.scripts[k] = clipStr(unquote(v), 90);
        }
      }
    } else if (f === 'go.mod') {
      const m = readText(abs).match(/^module\s+(\S+)/m);
      r.name = r.name || (m ? m[1] : null);
      r.packageManager = r.packageManager || 'go';
    } else if (f === 'Gemfile') r.packageManager = r.packageManager || 'bundler';
    else if (f === 'mix.exs') r.packageManager = r.packageManager || 'mix';
    else if (f === 'pubspec.yaml') r.packageManager = r.packageManager || 'pub';
    else if (f === 'pom.xml') r.packageManager = r.packageManager || (fs.existsSync(path.join(dirAbs, 'mvnw')) ? './mvnw' : 'mvn');
    else if (f.startsWith('build.gradle')) r.packageManager = r.packageManager || (fs.existsSync(path.join(dirAbs, 'gradlew')) ? './gradlew' : 'gradle');
    else if (MANIFEST_EXT[path.extname(f)] === 'dotnet') r.packageManager = r.packageManager || 'dotnet';
    if (stack && stack !== 'node') {
      const text = readText(abs);
      for (const [s, re, id] of TEXT_FW) if (s === stack && re.test(text)) add(r.fw, id);
    }
  }
  // Other lockfiles in this directory (non-node) and multiple node lockfiles.
  for (const [f] of Object.entries(LOCKFILES)) {
    const rel = toPosix(path.join(relDir, f));
    if (fs.existsSync(path.join(dirAbs, f)) && !r.lockfiles.includes(rel)) r.lockfiles.push(rel);
  }
  const nodeLocks = r.lockfiles.filter((l) => NODE_PM_ORDER.includes(LOCKFILES[path.basename(l)]));
  const nodePms = [...new Set(nodeLocks.map((l) => LOCKFILES[path.basename(l)]))];
  if (nodePms.length > 1) {
    info.warnings.push(`${r.path}: multiple lockfiles (${nodeLocks.join(', ')}); using ${r.packageManager}. Do not run the other package managers.`);
  }
  // Makefile / justfile targets.
  for (const f of ['Makefile', 'justfile']) {
    const t = readText(path.join(dirAbs, f));
    if (!t) continue;
    const names = [];
    const re = f === 'Makefile' ? /^([A-Za-z0-9][\w.-]*)\s*:(?!=)/gm : /^@?([A-Za-z0-9][\w-]*)(?:\s+[^:=\n]*)?:(?!=)/gm;
    let m;
    while ((m = re.exec(t)) && names.length < 20) if (!names.includes(m[1])) names.push(m[1]);
    for (const n of names) r.scripts[`${f === 'Makefile' ? 'make' : 'just'} ${n}`] = '';
  }
  r.stacks.sort();
  return r;
}

function describeConfig(rootAbs, rel) {
  const base = path.basename(rel);
  const abs = path.join(rootAbs, rel);
  if (/^tsconfig.*\.json$|^jsconfig\.json$/.test(base)) {
    const j = readJson(abs);
    const co = j?.compilerOptions || {};
    const bits = [];
    if (co.strict) bits.push('strict');
    if (co.jsx) bits.push(`jsx ${co.jsx}`);
    if (co.jsxImportSource) bits.push(`jsxImportSource ${co.jsxImportSource}`);
    if (co.moduleResolution) bits.push(`moduleResolution ${co.moduleResolution}`);
    if (co.paths) bits.push('paths ' + Object.keys(co.paths).join(' '));
    if (j?.extends) bits.push(`extends ${j.extends}`);
    return bits.join(', ');
  }
  if (/\.config\.(ts|js|mjs|cjs|mts)$/.test(base)) {
    const t = readText(abs, 256 * 1024);
    const m = t.match(/plugins\s*:\s*\[([\s\S]*?)\]\s*[,}\n]/);
    if (m) {
      const names = [...m[1].matchAll(/([A-Za-z_$][\w$.]*)\s*\(/g)].map((x) => x[1]);
      if (names.length) return 'plugins: ' + [...new Set(names)].join(', ');
    }
    return '';
  }
  if (base === '.env' || base.startsWith('.env.')) return 'present (contents not read)';
  return '';
}

function buildMap(rootAbs, depth) {
  const info = { warnings: [] };
  const dirCounts = new Map(); // rel dir -> recursive file count
  const dirChildren = new Map(); // rel dir -> Set(child dir rel)
  const ignoredTop = [];
  const topFiles = [];
  const extCounts = new Map();
  const manifestDirs = new Map(); // rel dir -> [manifest names]
  const testGroups = new Map();
  const testConfigs = [];
  const configs = [];
  const fileSet = new Set();
  let total = 0;
  let fileCount = 0;
  let capped = false;
  const kit = fs.existsSync(path.join(rootAbs, '.agents'));

  try {
    for (const ent of fs.readdirSync(rootAbs, { withFileTypes: true })) {
      if (ent.isDirectory() && isIgnoredDir(ent.name, ent.name)) ignoredTop.push(ent.name + '/');
    }
  } catch {}

  for (const e of walk(rootAbs, { dirs: true })) {
    if (++total > MAX_ENTRIES) {
      capped = true;
      break;
    }
    const segs = e.rel.split('/');
    const parentRel = segs.slice(0, -1).join('/');
    if (e.isDir) {
      dirCounts.set(e.rel, dirCounts.get(e.rel) || 0);
      if (!dirChildren.has(parentRel)) dirChildren.set(parentRel, new Set());
      dirChildren.get(parentRel).add(e.rel);
      continue;
    }
    fileCount++;
    // Recursive counts for every ancestor dir.
    for (let k = 1; k < segs.length; k++) {
      const d = segs.slice(0, k).join('/');
      dirCounts.set(d, (dirCounts.get(d) || 0) + 1);
    }
    if (segs.length === 1) topFiles.push(e.name);
    const inKit = segs[0] === '.agents';
    if (inKit) continue; // the kit itself is summarized separately, not analyzed as project code
    fileSet.add(e.rel);
    const ext = path.extname(e.name).toLowerCase();
    if (!SKIP_EXT.has(ext)) extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
    const dirDepth = segs.length - 1;
    const hiddenDir = segs.slice(0, -1).some((s) => s.startsWith('.'));
    if (dirDepth <= depth && !hiddenDir && (MANIFESTS[e.name] || MANIFEST_EXT[path.extname(e.name)])) {
      if (!manifestDirs.has(parentRel)) manifestDirs.set(parentRel, []);
      manifestDirs.get(parentRel).push(e.name);
    }
    const testDirIdx = segs.slice(0, -1).findIndex((s) => TEST_DIRS.has(s));
    const isTestFile = TEST_FILE_GLOBS.some((g) => g.re.test(e.name));
    if (testDirIdx >= 0 || isTestFile) {
      const key = testDirIdx >= 0 ? segs.slice(0, testDirIdx + 1).join('/') : parentRel || '.';
      testGroups.set(key, (testGroups.get(key) || 0) + 1);
    }
    if (dirDepth <= depth && TEST_CONFIG_GLOBS.some((g) => g.re.test(e.name))) testConfigs.push(e.rel);
    const isWorkflow = /^\.github\/workflows\/[^/]+\.ya?ml$/.test(e.rel);
    if (isWorkflow || (dirDepth <= Math.min(depth, 2) && CONFIG_GLOBS.some((g) => g.re.test(e.name)))) configs.push(e.rel);
  }

  const roots = [...manifestDirs.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([rel, files]) => analyzeRoot(rootAbs, rel, files, info));

  // Entry points, per root (patterns relative to the root dir).
  const entryPoints = [];
  const routeDirs = [];
  const bases = roots.length ? roots.map((r) => (r.path === '.' ? '' : r.path)) : [''];
  for (const base of bases) {
    const prefix = base ? base + '/' : '';
    for (const rel of fileSet) {
      if (!rel.startsWith(prefix)) continue;
      const sub = rel.slice(prefix.length);
      if (ENTRY_GLOBS.some((g) => g.re.test(sub)) && ENTRY_EXT.test(sub) && !entryPoints.includes(rel)) entryPoints.push(rel);
    }
    const pkg = readJson(path.join(rootAbs, base, 'package.json'));
    if (pkg) {
      const cands = [pkg.main, pkg.module, typeof pkg.bin === 'string' ? pkg.bin : null, ...Object.values(typeof pkg.bin === 'object' && pkg.bin ? pkg.bin : {})];
      const exp = pkg.exports;
      if (typeof exp === 'string') cands.push(exp);
      else if (exp && typeof exp['.'] === 'string') cands.push(exp['.']);
      for (const c of cands) {
        if (typeof c !== 'string') continue;
        const rel = toPosix(path.join(base, c)).replace(/^\.\//, '');
        if (fileSet.has(rel) && !entryPoints.includes(rel)) entryPoints.push(rel);
      }
    }
    for (const rd of ROUTE_DIRS) {
      const rel = prefix + rd;
      if (dirCounts.has(rel) && !routeDirs.some((x) => x.path === rel)) routeDirs.push({ path: rel, files: dirCounts.get(rel) });
    }
  }
  entryPoints.sort();

  // Tree.
  const buildTree = (rel, level) => {
    const kids = [...(dirChildren.get(rel) || [])].sort();
    return kids.map((k) => ({
      path: k,
      files: dirCounts.get(k) || 0,
      children: level < depth ? buildTree(k, level + 1) : [],
      more: level >= depth ? (dirChildren.get(k) || new Set()).size : 0,
    }));
  };
  const tree = buildTree('', 1);

  const languages = [...extCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([ext, files]) => ({ ext: ext.slice(1), files }));

  let kitInfo = null;
  if (kit) {
    const count = (rel, pred) => {
      try {
        return fs.readdirSync(path.join(rootAbs, '.agents', rel), { withFileTypes: true }).filter(pred).length;
      } catch {
        return 0;
      }
    };
    kitInfo = {
      rules: count('rules', (d) => d.isFile() && d.name.endsWith('.md')),
      skills: count('skills', (d) => d.isDirectory() && fs.existsSync(path.join(rootAbs, '.agents/skills', d.name, 'SKILL.md'))),
      agents: count('agents', (d) => (d.isFile() && d.name.endsWith('.md')) || d.isDirectory()),
      hooks: fs.existsSync(path.join(rootAbs, '.agents/hooks.json')),
    };
  }

  const stacks = [...new Set(roots.flatMap((r) => r.stacks))].sort();
  const top = roots.find((r) => r.path === '.') || roots[0];
  return {
    v: 1,
    ts: Date.now(),
    root: toPosix(rootAbs),
    depth,
    git: gitInfo(rootAbs),
    packageManager: top ? top.packageManager : null,
    stacks,
    roots,
    entryPoints: entryPoints.slice(0, 25),
    routeDirs,
    tests: {
      locations: [...testGroups.entries()].sort((a, b) => b[1] - a[1]).map(([p, files]) => ({ path: p, files })),
      configs: testConfigs.sort(),
    },
    config: configs.sort().map((p) => ({ path: p, note: describeConfig(rootAbs, p) })),
    tree,
    topFiles: topFiles.sort(),
    ignoredTop: ignoredTop.sort(),
    languages,
    totals: { files: fileCount, dirs: dirCounts.size, capped },
    kit: kitInfo,
    warnings: info.warnings,
  };
}

function renderText(m) {
  const L = [];
  const g = m.git.isRepo
    ? `git: ${m.git.branch || '?'}${m.git.dirty ? `, ${m.git.dirty} changed` : ', clean'}${m.git.lastCommit ? ` (${m.git.lastCommit})` : ''}`
    : 'git: not a git repo';
  L.push(`# Repo map: ${path.basename(m.root)}`);
  L.push(`root: ${m.root} · ${g} · files: ${m.totals.files}${m.totals.capped ? '+ (capped)' : ''}`);
  L.push(`stacks: ${m.stacks.join(', ') || 'none detected'} · package manager: ${m.packageManager || 'n/a'}`);
  if (m.languages.length) L.push('file types outside .agents/ (files): ' + m.languages.map((l) => `${l.ext} ${l.files}`).join(', '));
  L.push('', `## Projects (manifest roots, depth <= ${m.depth})`);
  if (!m.roots.length) L.push('- none found');
  for (const r of m.roots) {
    L.push(`- ${r.path} [${r.stacks.join(', ')}]${r.name ? ' ' + r.name : ''} · pm: ${r.packageManager || 'n/a'}` +
      `${r.lockfiles.length ? ` (${r.lockfiles.map((l) => path.basename(l)).join(', ')})` : ''}` +
      `${r.notes.length ? ' · ' + r.notes.join(' · ') : ''}`);
    L.push(`  manifests: ${r.manifests.join(', ')}`);
    if (r.frameworks.length) L.push(`  frameworks: ${r.frameworks.join(', ')}`);
    if (r.fw.length) L.push(`  kit packs (rules/fw-*.md): ${r.fw.join(', ')}`);
    if (r.tooling.length) L.push(`  tooling: ${r.tooling.join(', ')}`);
    const sc = Object.entries(r.scripts);
    if (sc.length) {
      L.push('  scripts: ' + sc.slice(0, 25).map(([k, v]) => (v ? `${k} = ${v}` : k)).join(' · ') + (sc.length > 25 ? ` · +${sc.length - 25} more` : ''));
    }
  }
  L.push('', '## Entry points');
  L.push(m.entryPoints.length ? '- ' + m.entryPoints.join(', ') : '- none found');
  if (m.routeDirs.length) L.push('- route/page dirs: ' + m.routeDirs.map((d) => `${d.path}/ (${d.files} files)`).join(', '));
  L.push('', '## Tests');
  const tl = m.tests.locations;
  L.push(tl.length ? '- ' + tl.slice(0, 12).map((t) => `${t.path}/ (${t.files})`).join(', ') + (tl.length > 12 ? `, +${tl.length - 12} more` : '') : '- no test files found');
  if (m.tests.configs.length) L.push('- configs: ' + m.tests.configs.join(', '));
  L.push('', '## Notable config');
  if (!m.config.length) L.push('- none');
  const plain = [];
  for (const c of m.config) {
    if (c.note) L.push(`- ${c.path}: ${c.note}`);
    else plain.push(c.path);
  }
  if (plain.length) L.push('- ' + plain.join(', '));
  L.push('', `## Tree (depth ${m.depth}; recursive file counts; ignored dirs skipped)`);
  const renderNode = (n, indent) => {
    L.push(`${'  '.repeat(indent)}${n.path.split('/').pop()}/ ${n.files}${n.more ? ` (+${n.more} subdirs)` : ''}`);
    const kids = n.children;
    kids.slice(0, 15).forEach((k) => renderNode(k, indent + 1));
    if (kids.length > 15) L.push(`${'  '.repeat(indent + 1)}... +${kids.length - 15} more dirs`);
  };
  m.tree.slice(0, 40).forEach((n) => renderNode(n, 0));
  if (m.topFiles.length) L.push(`top-level files: ${m.topFiles.slice(0, 30).join(', ')}${m.topFiles.length > 30 ? ', ...' : ''}`);
  if (m.ignoredTop.length) L.push(`ignored: ${m.ignoredTop.join(', ')}`);
  if (m.kit) {
    L.push('', '## Agent kit (.agents/)');
    L.push(`- ${m.kit.rules} rules, ${m.kit.skills} skills, ${m.kit.agents} agents, hooks.json: ${m.kit.hooks ? 'yes' : 'no'}`);
  }
  if (m.warnings.length) {
    L.push('', '## Warnings');
    for (const w of m.warnings) L.push(`- ${w}`);
  }
  return L.join('\n') + '\n';
}

function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`repo-map: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
  if (o.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const rootAbs = path.resolve(o.root || defaultRoot());
  try {
    if (!fs.statSync(rootAbs).isDirectory()) throw new Error('not a directory');
  } catch {
    process.stderr.write(`repo-map: root is not a directory: ${toPosix(rootAbs)}\n`);
    return 2;
  }
  const map = buildMap(rootAbs, o.depth);
  const agentsDir = path.join(rootAbs, '.agents');
  let stateNote = '';
  if (fs.existsSync(agentsDir)) {
    try {
      const stateDir = path.join(agentsDir, '.state');
      fs.mkdirSync(stateDir, { recursive: true });
      const target = path.join(stateDir, 'repo-map.json');
      const tmp = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(map, null, 2) + '\n');
      fs.renameSync(tmp, target);
      stateNote = 'written: .agents/.state/repo-map.json';
    } catch (e) {
      stateNote = `could not write .agents/.state/repo-map.json: ${e.message}`;
    }
  } else {
    stateNote = 'state not written: no .agents/ folder in the root';
  }
  if (o.json) process.stdout.write(JSON.stringify(map, null, 2) + '\n');
  else process.stdout.write(renderText(map) + `(${stateNote})\n`);
  return 0;
}

process.stdout.on('error', (e) => {
  if (e && e.code === 'EPIPE') process.exit(0);
});

try {
  process.exitCode = main();
} catch (err) {
  process.stderr.write(`repo-map: internal error: ${err && err.message ? err.message : String(err)}\n`);
  process.exitCode = 2;
}
