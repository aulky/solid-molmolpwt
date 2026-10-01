#!/usr/bin/env node
// pkg-info.mjs - find the EXACT version of a dependency (declared range, locked version, installed copy)
// and where its source/types/docs live, across ecosystems. Zero dependencies, Node >= 18, ESM.
// Part of the Frontier Kit research-docs skill.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const HELP = `Usage:
  node .agents/skills/research-docs/scripts/pkg-info.mjs <package> [<package>...] [options]
  node .agents/skills/research-docs/scripts/pkg-info.mjs --direct [options]

For each package prints: ecosystem, declared range (manifest), locked version (lockfile),
installed version + on-disk path (source/types to read), and versioned docs URLs.
--direct lists every direct dependency of every manifest found (declared + locked).

Options:
  --eco <id>     restrict to node|python|rust|go|php|ruby|dotnet|dart|elixir
  --root <dir>   project root (default: current directory)
  --depth <n>    manifest search depth (default: 2)
  --json         JSON output
  --help         show this help
Exit codes: 0 = every requested package found, 1 = some not found, 2 = usage/internal error.`;

const IGNORE = new Set(['.git', 'node_modules', 'dist', 'build', 'out', '.output', '.next', '.nuxt', '.svelte-kit', '.vinxi',
  'target', 'vendor', '.venv', 'venv', '__pycache__', 'coverage', '.turbo', '.cache', '.gradle', 'bin', 'obj', '.dart_tool',
  '.scratch', '.agents', 'deps', '_build']);
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const readJson = (p) => { const t = read(p); if (t == null) return null; try { return JSON.parse(t); } catch { return null; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const slash = (p) => p.split(path.sep).join('/');

// JSONC -> JSON (bun.lock): drop comments and trailing commas outside strings.
export function parseJsonc(text) {
  let out = ''; let inStr = false; let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) { out += c; if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }
    if (c === ',') { let j = i + 1; while (j < text.length && /\s/.test(text[j])) j++; if (text[j] === '}' || text[j] === ']') continue; }
    out += c;
  }
  return JSON.parse(out);
}

function findManifestDirs(root, depth) {
  const dirs = [];
  const visit = (dir, d) => {
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    dirs.push({ dir, files: new Set(ents.filter((e) => e.isFile()).map((e) => e.name)) });
    if (d >= depth) return;
    for (const e of ents) if (e.isDirectory() && !IGNORE.has(e.name) && !e.name.startsWith('.')) visit(path.join(dir, e.name), d + 1);
  };
  visit(root, 0);
  return dirs;
}

// ---------- Node ----------
export function nodeLocked(dir, files, name) {
  const found = [];
  if (files.has('bun.lock')) {
    try {
      const j = parseJsonc(read(path.join(dir, 'bun.lock')));
      for (const [k, v] of Object.entries(j.packages || {})) {
        if ((k === name || k.endsWith(`/${name}`)) && Array.isArray(v) && typeof v[0] === 'string') {
          const at = v[0].lastIndexOf('@');
          if (at > 0 && v[0].slice(0, at) === name) found.push(v[0].slice(at + 1));
        }
      }
      return { lockfile: 'bun.lock', versions: [...new Set(found)] };
    } catch { return { lockfile: 'bun.lock', versions: [], error: 'unparsable' }; }
  }
  if (files.has('package-lock.json') || files.has('npm-shrinkwrap.json')) {
    const lf = files.has('package-lock.json') ? 'package-lock.json' : 'npm-shrinkwrap.json';
    const j = readJson(path.join(dir, lf)) || {};
    for (const [k, v] of Object.entries(j.packages || {})) if (k === `node_modules/${name}` || k.endsWith(`/node_modules/${name}`)) found.push(v.version);
    if (!found.length && j.dependencies && j.dependencies[name]) found.push(j.dependencies[name].version);
    return { lockfile: lf, versions: [...new Set(found.filter(Boolean))] };
  }
  if (files.has('pnpm-lock.yaml')) {
    const t = read(path.join(dir, 'pnpm-lock.yaml')) || '';
    const esc = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const re = new RegExp(`^\\s{2}'?/?${esc}@([^:('\\s]+)`, 'gm');
    let m; while ((m = re.exec(t)) !== null) found.push(m[1]);
    return { lockfile: 'pnpm-lock.yaml', versions: [...new Set(found)] };
  }
  if (files.has('yarn.lock')) {
    const t = read(path.join(dir, 'yarn.lock')) || '';
    for (const block of t.split(/\r?\n\r?\n/)) {
      const head = block.split(/\r?\n/).find((l) => l && !l.startsWith('#') && !l.startsWith(' '));
      if (!head) continue;
      const names = head.replace(/:$/, '').split(/,\s*/).map((s) => s.replace(/^"|"$/g, ''));
      if (!names.some((n) => n.startsWith(`${name}@`))) continue;
      const v = /^\s+version:?\s+"?([^"\s]+)"?/m.exec(block);
      if (v) found.push(v[1]);
    }
    return { lockfile: 'yarn.lock', versions: [...new Set(found)] };
  }
  return null;
}

// First *.d.ts path referenced by package.json "exports" (conditions such as "types"/"import").
export function exportsTypes(exp, depth = 0) {
  if (!exp || depth > 4) return null;
  if (typeof exp === 'string') return /\.d\.[cm]?ts$/.test(exp) ? exp : null;
  if (Array.isArray(exp)) { for (const e of exp) { const t = exportsTypes(e, depth + 1); if (t) return t; } return null; }
  if (typeof exp === 'object') {
    if (typeof exp.types === 'string') return exp.types;
    const keys = Object.keys(exp);
    const order = ['.', ...keys.filter((k) => k !== '.')];
    for (const k of order) { if (!(k in exp)) continue; const t = exportsTypes(exp[k], depth + 1); if (t) return t; }
  }
  return null;
}

// Where TypeScript would find declarations: "types" field, exports "." types condition,
// a sibling .d.ts of the main entry, index.d.ts, then any .d.ts named in exports.
function resolveTypes(pdir, pj) {
  if (pj.types || pj.typings) return pj.types || pj.typings;
  const dot = pj.exports && typeof pj.exports === 'object' && !Array.isArray(pj.exports) && '.' in pj.exports ? pj.exports['.'] : pj.exports;
  const dotTypes = exportsTypes(dot);
  if (dotTypes) return dotTypes;
  const entries = [typeof dot === 'string' ? dot : null, dot && typeof dot === 'object' ? (dot.import || dot.default || dot.require) : null, pj.module, pj.main].filter((e) => typeof e === 'string');
  for (const e of entries) {
    for (const cand of [e.replace(/\.(?:m|c)?jsx?$/, '.d.ts'), e.replace(/\.mjs$/, '.d.mts'), e.replace(/\.cjs$/, '.d.cts')]) {
      if (cand !== e && fs.existsSync(path.join(pdir, cand))) return cand;
    }
  }
  if (fs.existsSync(path.join(pdir, 'index.d.ts'))) return 'index.d.ts';
  return exportsTypes(pj.exports);
}

function repoUrl(r) {
  const u = typeof r === 'string' ? r : r && r.url;
  if (!u) return '';
  return u.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/^github:/, 'https://github.com/').replace(/\.git$/, '').replace(/^ssh:\/\/git@/, 'https://');
}

function nodeInfo(dir, files, name) {
  const pj = readJson(path.join(dir, 'package.json'));
  if (!pj) return null;
  let declared = null;
  for (const f of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) if (pj[f] && pj[f][name]) { declared = { range: pj[f][name], field: f }; break; }
  const locked = nodeLocked(dir, files, name);
  let installed = null;
  let d = dir;
  for (let i = 0; i < 4; i++) {
    const pdir = path.join(d, 'node_modules', ...name.split('/'));
    const ipj = readJson(path.join(pdir, 'package.json'));
    if (ipj) {
      let real = pdir; try { real = fs.realpathSync(pdir); } catch { /* keep */ }
      const types = resolveTypes(pdir, ipj);
      const typesPkg = !types && readJson(path.join(d, 'node_modules', '@types', name.startsWith('@') ? name.slice(1).replace('/', '__') : name, 'package.json'));
      installed = { version: ipj.version, path: slash(real), types: types || (typesPkg ? `@types/${name}@${typesPkg.version}` : null),
        exports: ipj.exports && typeof ipj.exports === 'object' ? Object.keys(ipj.exports).slice(0, 12) : null,
        docs: ['README.md', 'CHANGELOG.md', 'docs'].filter((f) => fs.existsSync(path.join(pdir, f))),
        homepage: ipj.homepage || '', repository: repoUrl(ipj.repository) };
      break;
    }
    const up = path.dirname(d); if (up === d) break; d = up;
  }
  if (!declared && !installed && !(locked && locked.versions.length)) return null;
  const ver = installed?.version || locked?.versions?.[0];
  return { eco: 'node', manifest: 'package.json', declared, locked, installed,
    docs: [installed?.homepage, installed?.repository, ver ? `https://www.npmjs.com/package/${name}/v/${ver}` : `https://www.npmjs.com/package/${name}`].filter(Boolean) };
}

// ---------- Python ----------
const pyNorm = (n) => n.toLowerCase().replace(/[-_.]+/g, '-');
function pyDeclared(dir, files, name) {
  const want = pyNorm(name);
  const t = files.has('pyproject.toml') ? read(path.join(dir, 'pyproject.toml')) || '' : '';
  const specs = [];
  for (const m of t.matchAll(/["']([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*([<>=!~^][^"';]*)?(?:;[^"']*)?["']/g)) if (pyNorm(m[1]) === want) specs.push({ range: (m[3] || '*').trim(), file: 'pyproject.toml' });
  for (const m of t.matchAll(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*(?:"([^"]+)"|\{[^}]*version\s*=\s*"([^"]+)")/gm)) if (pyNorm(m[1]) === want) specs.push({ range: m[2] || m[3], file: 'pyproject.toml (poetry)' });
  for (const f of [...files].filter((x) => /^requirements.*\.txt$/i.test(x))) {
    for (const line of (read(path.join(dir, f)) || '').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*([<>=!~][^#;]*)?/.exec(line);
      if (m && pyNorm(m[1]) === want) specs.push({ range: (m[3] || '*').trim(), file: f });
    }
  }
  return specs.length ? specs : null;
}
function tomlLocked(text, name) {
  const want = pyNorm(name); const out = [];
  for (const block of text.split(/\n\[\[package\]\]/)) {
    const n = /\nname\s*=\s*"([^"]+)"/.exec(`\n${block}`); const v = /\nversion\s*=\s*"([^"]+)"/.exec(`\n${block}`);
    if (n && v && pyNorm(n[1]) === want) out.push(v[1]);
  }
  return out;
}
function pyInfo(dir, files, name) {
  const declared = pyDeclared(dir, files, name);
  let locked = null;
  for (const lf of ['uv.lock', 'poetry.lock', 'pdm.lock']) if (files.has(lf)) { locked = { lockfile: lf, versions: tomlLocked(read(path.join(dir, lf)) || '', name) }; break; }
  if (!locked && files.has('Pipfile.lock')) {
    const j = readJson(path.join(dir, 'Pipfile.lock')) || {};
    const e = (j.default || {})[name] || (j.develop || {})[name];
    locked = { lockfile: 'Pipfile.lock', versions: e && e.version ? [e.version.replace(/^==/, '')] : [] };
  }
  if (!declared && !(locked && locked.versions.length)) return null;
  const venvPy = [path.join(dir, '.venv', 'Scripts', 'python.exe'), path.join(dir, '.venv', 'bin', 'python')].find((p) => fs.existsSync(p));
  const py = venvPy || 'python';
  const code = 'import sys,importlib.metadata as m\ntry:\n d=m.distribution(sys.argv[1]);f=d.files or []\n top=(d.read_text("top_level.txt") or "").split()\n print(d.version);print(d.locate_file(top[0] if top else ""));print(d.metadata.get("Home-page") or "");print(";".join(d.metadata.get_all("Project-URL") or []))\nexcept Exception as e:\n print("NOTFOUND")';
  const r = spawnSync(py, ['-c', code, name], { encoding: 'utf8', timeout: 20000, windowsHide: true, cwd: dir });
  let installed = null;
  if (r.status === 0 && r.stdout && !r.stdout.startsWith('NOTFOUND')) {
    const [version, loc, home, urls] = r.stdout.split(/\r?\n/);
    installed = { version, path: slash(String(loc || '')), interpreter: venvPy ? slash(path.relative(dir, venvPy)) : 'python (PATH)', homepage: home || '', urls: urls ? urls.split(';').slice(0, 4) : [] };
  }
  const ver = installed?.version || locked?.versions?.[0];
  return { eco: 'python', manifest: declared ? declared[0].file : (locked?.lockfile || ''), declared, locked, installed,
    docs: [installed?.homepage, ...(installed?.urls || []).map((u) => u.split(',').pop().trim()), ver ? `https://pypi.org/project/${name}/${ver}/` : `https://pypi.org/project/${name}/`].filter(Boolean) };
}

// ---------- Rust ----------
function cargoHome() { return process.env.CARGO_HOME || path.join(os.homedir(), '.cargo'); }
function rustInfo(dir, files, name) {
  const t = read(path.join(dir, 'Cargo.toml')) || '';
  const esc = name.replace(/[-]/g, '[-_]');
  const m = new RegExp(`^\\s*${esc}\\s*=\\s*(?:"([^"]+)"|\\{[^}\\n]*?version\\s*=\\s*"([^"]+)"[^}\\n]*\\}|\\{[^}\\n]*workspace\\s*=\\s*true[^}\\n]*\\})`, 'm').exec(t);
  const declared = m ? { range: m[1] || m[2] || 'workspace', file: 'Cargo.toml' } : null;
  let lockDir = dir; let lockText = null;
  for (let i = 0; i < 4 && !lockText; i++) { lockText = read(path.join(lockDir, 'Cargo.lock')); if (!lockText) { const up = path.dirname(lockDir); if (up === lockDir) break; lockDir = up; } }
  const versions = lockText ? tomlLocked(lockText, name).filter(Boolean) : [];
  if (!declared && !versions.length) return null;
  const regSrc = path.join(cargoHome(), 'registry', 'src');
  const paths = [];
  if (isDir(regSrc)) for (const idx of fs.readdirSync(regSrc)) for (const v of versions) { const p = path.join(regSrc, idx, `${name}-${v}`); if (isDir(p)) paths.push(slash(p)); }
  const ver = versions[0];
  return { eco: 'rust', manifest: 'Cargo.toml', declared, locked: { lockfile: lockText ? slash(path.relative(dir, path.join(lockDir, 'Cargo.lock'))) || 'Cargo.lock' : null, versions },
    installed: paths.length ? { version: ver, path: paths[0], others: paths.slice(1) } : null,
    docs: [ver ? `https://docs.rs/${name}/${ver}` : `https://docs.rs/${name}`, `https://crates.io/crates/${name}`], hint: paths.length ? '' : 'source not in the registry cache yet: run `cargo fetch`' };
}

// ---------- Go ----------
function goInfo(dir, files, name) {
  const t = read(path.join(dir, 'go.mod')) || '';
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^\\s*(?:require\\s+)?${esc}\\s+(v[^\\s]+)(\\s*//\\s*indirect)?`, 'm').exec(t);
  const declared = m ? { range: m[1], file: 'go.mod', indirect: !!m[2] } : null;
  let installed = null;
  const r = spawnSync('go', ['list', '-m', '-json', name], { cwd: dir, encoding: 'utf8', timeout: 30000, windowsHide: true });
  if (r.status === 0 && r.stdout) { try { const j = JSON.parse(r.stdout); installed = { version: j.Version, path: j.Dir ? slash(j.Dir) : null, replace: j.Replace ? `${j.Replace.Path}@${j.Replace.Version || ''}` : null }; } catch { /* ignore */ } }
  if (!declared && !installed) return null;
  const ver = installed?.version || declared?.range;
  return { eco: 'go', manifest: 'go.mod', declared, locked: declared ? { lockfile: 'go.mod (MVS selection; go.sum pins hashes)', versions: [installed?.version || declared.range] } : null, installed,
    docs: [`https://pkg.go.dev/${name}${ver ? `@${ver}` : ''}`], hint: installed?.path ? `read docs offline: \`go doc ${name}\` or \`go doc <pkg>.<Symbol>\`` : 'run `go mod download` to fetch the source' };
}

// ---------- PHP ----------
function phpInfo(dir, files, name) {
  const cj = readJson(path.join(dir, 'composer.json'));
  if (!cj) return null;
  const range = (cj.require || {})[name] || (cj['require-dev'] || {})[name];
  const declared = range ? { range, field: (cj.require || {})[name] ? 'require' : 'require-dev' } : null;
  const lock = readJson(path.join(dir, 'composer.lock'));
  const lp = lock ? [...(lock.packages || []), ...(lock['packages-dev'] || [])].find((p) => p.name === name) : null;
  const vdir = path.join(dir, 'vendor', ...name.split('/'));
  const installedJson = readJson(path.join(dir, 'vendor', 'composer', 'installed.json'));
  const ip = installedJson ? (installedJson.packages || installedJson).find?.((p) => p.name === name) : null;
  if (!declared && !lp && !ip) return null;
  const ver = ip?.version || lp?.version;
  return { eco: 'php', manifest: 'composer.json', declared, locked: lock ? { lockfile: 'composer.lock', versions: lp ? [lp.version] : [] } : null,
    installed: isDir(vdir) ? { version: ip?.version || null, path: slash(vdir) } : null,
    docs: [lp?.homepage, lp?.source?.url?.replace(/\.git$/, ''), `https://packagist.org/packages/${name}${ver ? `#${ver}` : ''}`].filter(Boolean) };
}

// ---------- Ruby ----------
function rubyInfo(dir, files, name) {
  const gf = read(path.join(dir, 'Gemfile')) || '';
  const esc = name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const m = new RegExp(`^\\s*gem\\s+["']${esc}["'](?:\\s*,\\s*["']([^"']+)["'])?`, 'm').exec(gf);
  const declared = m ? { range: m[1] || '*', file: 'Gemfile' } : null;
  const lock = read(path.join(dir, 'Gemfile.lock')) || '';
  const lm = new RegExp(`^ {4}${esc} \\(([^)]+)\\)`, 'm').exec(lock);
  if (!declared && !lm) return null;
  const ver = lm ? lm[1] : null;
  return { eco: 'ruby', manifest: 'Gemfile', declared, locked: lock ? { lockfile: 'Gemfile.lock', versions: ver ? [ver] : [] } : null, installed: null,
    docs: [ver ? `https://rubydoc.info/gems/${name}/${ver}` : `https://rubydoc.info/gems/${name}`, `https://rubygems.org/gems/${name}${ver ? `/versions/${ver}` : ''}`],
    hint: `installed path: \`bundle info ${name} --path\`` };
}

// ---------- .NET ----------
function dotnetInfo(dir, files, name) {
  const projs = [...files].filter((f) => /\.(csproj|fsproj|vbproj)$|^Directory\.Packages\.props$/i.test(f));
  if (!projs.length) return null;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let declared = null;
  for (const f of projs) {
    const t = read(path.join(dir, f)) || '';
    const m = new RegExp(`<Package(?:Reference|Version)\\s+Include="${esc}"(?:\\s+Version="([^"]+)")?[^>]*?(?:/>|>([\\s\\S]*?)</Package(?:Reference|Version)>)`, 'i').exec(t);
    if (m) { declared = { range: m[1] || ((/<Version>([^<]+)<\/Version>/i.exec(m[2] || '') || [])[1]) || '(central: Directory.Packages.props)', file: f }; break; }
  }
  const lockJ = readJson(path.join(dir, 'packages.lock.json'));
  const versions = [];
  if (lockJ) for (const tfm of Object.values(lockJ.dependencies || {})) for (const [id, v] of Object.entries(tfm)) if (id.toLowerCase() === name.toLowerCase() && v.resolved) versions.push(v.resolved);
  if (!declared && !versions.length) return null;
  const cache = process.env.NUGET_PACKAGES || path.join(os.homedir(), '.nuget', 'packages');
  const pdir = path.join(cache, name.toLowerCase());
  const have = isDir(pdir) ? fs.readdirSync(pdir) : [];
  const ver = versions[0] || (declared && have.includes(declared.range) ? declared.range : null);
  return { eco: 'dotnet', manifest: declared?.file || 'packages.lock.json', declared, locked: lockJ ? { lockfile: 'packages.lock.json', versions: [...new Set(versions)] } : null,
    installed: ver && have.includes(ver) ? { version: ver, path: slash(path.join(pdir, ver)), note: 'XML API docs: lib/<tfm>/*.xml' } : (have.length ? { version: null, cached: have.slice(-5) } : null),
    docs: [`https://www.nuget.org/packages/${name}${ver ? `/${ver}` : ''}`] };
}

// ---------- Dart ----------
function dartInfo(dir, files, name) {
  if (!files.has('pubspec.yaml')) return null;
  const t = read(path.join(dir, 'pubspec.yaml')) || '';
  const m = new RegExp(`^\\s{2}${name}:\\s*([^\\n#]*)`, 'm').exec(t);
  const declared = m ? { range: m[1].trim() || '(complex)', file: 'pubspec.yaml' } : null;
  const lock = read(path.join(dir, 'pubspec.lock')) || '';
  const lm = new RegExp(`^\\s{2}${name}:\\n(?:\\s{4}.*\\n)*?\\s{4}version:\\s*"([^"]+)"`, 'm').exec(lock.replace(/\r/g, ''));
  if (!declared && !lm) return null;
  const pc = readJson(path.join(dir, '.dart_tool', 'package_config.json'));
  const pe = pc ? (pc.packages || []).find((p) => p.name === name) : null;
  let p = pe ? pe.rootUri : null;
  if (p && p.startsWith('file://')) { try { p = slash(new URL(p).pathname.replace(/^\/([A-Za-z]:)/, '$1')); } catch { /* keep */ } }
  const ver = lm ? lm[1] : null;
  return { eco: 'dart', manifest: 'pubspec.yaml', declared, locked: lock ? { lockfile: 'pubspec.lock', versions: ver ? [ver] : [] } : null,
    installed: p ? { version: ver, path: decodeURIComponent(p) } : null, docs: [ver ? `https://pub.dev/documentation/${name}/${ver}/` : `https://pub.dev/packages/${name}`] };
}

// ---------- Elixir ----------
function elixirInfo(dir, files, name) {
  if (!files.has('mix.exs')) return null;
  const t = read(path.join(dir, 'mix.exs')) || '';
  const m = new RegExp(`\\{:${name},\\s*"([^"]+)"`).exec(t);
  const declared = m ? { range: m[1], file: 'mix.exs' } : null;
  const lock = read(path.join(dir, 'mix.lock')) || '';
  const lm = new RegExp(`"${name}":\\s*\\{:hex,\\s*:${name},\\s*"([^"]+)"`).exec(lock);
  if (!declared && !lm) return null;
  const ver = lm ? lm[1] : null;
  const ddir = path.join(dir, 'deps', name);
  return { eco: 'elixir', manifest: 'mix.exs', declared, locked: lock ? { lockfile: 'mix.lock', versions: ver ? [ver] : [] } : null,
    installed: isDir(ddir) ? { version: ver, path: slash(ddir) } : null, docs: [ver ? `https://hexdocs.pm/${name}/${ver}/` : `https://hexdocs.pm/${name}/`] };
}

const ECO_FNS = { node: [(f) => f.has('package.json'), nodeInfo], python: [(f) => f.has('pyproject.toml') || [...f].some((x) => /^requirements.*\.txt$|^(uv|poetry|pdm)\.lock$|^Pipfile\.lock$/i.test(x)), pyInfo],
  rust: [(f) => f.has('Cargo.toml'), rustInfo], go: [(f) => f.has('go.mod'), goInfo], php: [(f) => f.has('composer.json'), phpInfo],
  ruby: [(f) => f.has('Gemfile'), rubyInfo], dotnet: [(f) => [...f].some((x) => /\.(csproj|fsproj|vbproj)$/i.test(x)), dotnetInfo],
  dart: [(f) => f.has('pubspec.yaml'), dartInfo], elixir: [(f) => f.has('mix.exs'), elixirInfo] };

export function lookup(root, name, opts = {}) {
  const res = [];
  for (const { dir, files } of findManifestDirs(root, opts.depth ?? 2)) {
    for (const [eco, [detect, fn]] of Object.entries(ECO_FNS)) {
      if (opts.eco && opts.eco !== eco) continue;
      if (!detect(files)) continue;
      let info = null;
      try { info = fn(dir, files, name); } catch (e) { info = { eco, error: String(e && e.message) }; }
      if (info) {
        info.dir = slash(path.relative(root, dir)) || '.';
        const lv = info.locked?.versions || [];
        const iv = info.installed?.version;
        info.warnings = [];
        if (iv && lv.length && !lv.includes(iv)) info.warnings.push(`installed ${iv} != locked ${lv.join('/')} - reinstall with the project package manager before trusting installed files`);
        if (lv.length > 1) info.warnings.push(`multiple locked versions (${lv.join(', ')}) - the direct dependency is usually the one matching the declared range`);
        if (!lv.length && !iv) info.warnings.push('declared but neither locked nor installed - version unknown; do not assume latest');
        res.push({ name, ...info });
      }
    }
  }
  return res;
}

export function directDeps(root, opts = {}) {
  const out = [];
  for (const { dir, files } of findManifestDirs(root, opts.depth ?? 2)) {
    const rel = slash(path.relative(root, dir)) || '.';
    const pj = files.has('package.json') ? readJson(path.join(dir, 'package.json')) : null;
    if (pj && (!opts.eco || opts.eco === 'node')) {
      for (const f of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const [n, r] of Object.entries(pj[f] || {})) {
          const l = nodeLocked(dir, files, n);
          const ipj = readJson(path.join(dir, 'node_modules', ...n.split('/'), 'package.json'));
          out.push({ eco: 'node', dir: rel, name: n, declared: r, field: f, locked: l?.versions?.join('/') || '', installed: ipj?.version || '' });
        }
      }
    }
    if (files.has('composer.json') && (!opts.eco || opts.eco === 'php')) {
      const cj = readJson(path.join(dir, 'composer.json')) || {};
      const lock = readJson(path.join(dir, 'composer.lock'));
      const all = lock ? [...(lock.packages || []), ...(lock['packages-dev'] || [])] : [];
      for (const f of ['require', 'require-dev']) for (const [n, r] of Object.entries(cj[f] || {})) out.push({ eco: 'php', dir: rel, name: n, declared: r, field: f, locked: all.find((p) => p.name === n)?.version || '', installed: '' });
    }
    if (files.has('Cargo.toml') && (!opts.eco || opts.eco === 'rust')) {
      const t = read(path.join(dir, 'Cargo.toml')) || '';
      let sect = '';
      const lockText = read(path.join(dir, 'Cargo.lock')) || '';
      for (const line of t.split(/\r?\n/)) {
        const s = /^\s*\[([^\]]+)\]/.exec(line); if (s) { sect = s[1]; continue; }
        if (!/(^|\.)(dev-|build-)?dependencies$/.test(sect)) continue;
        const m = /^\s*([A-Za-z0-9_-]+)\s*=\s*(?:"([^"]+)"|\{.*?version\s*=\s*"([^"]+)".*\}|\{.*\})/.exec(line);
        if (m) out.push({ eco: 'rust', dir: rel, name: m[1], declared: m[2] || m[3] || '(path/git/workspace)', field: sect, locked: tomlLocked(lockText, m[1]).join('/'), installed: '' });
      }
    }
    if (files.has('go.mod') && (!opts.eco || opts.eco === 'go')) {
      const t = read(path.join(dir, 'go.mod')) || '';
      const goLine = /^go\s+(\S+)/m.exec(t);
      if (goLine) out.push({ eco: 'go', dir: rel, name: 'go (toolchain)', declared: goLine[1], field: 'go', locked: '', installed: '' });
      for (const m of t.matchAll(/^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]{2,}\/[^\s]+)\s+(v[^\s]+)(\s*\/\/\s*indirect)?/gm)) if (!m[3]) out.push({ eco: 'go', dir: rel, name: m[1], declared: m[2], field: 'require', locked: m[2], installed: '' });
    }
    if (files.has('pyproject.toml') && (!opts.eco || opts.eco === 'python')) {
      const t = read(path.join(dir, 'pyproject.toml')) || '';
      const lockName = ['uv.lock', 'poetry.lock', 'pdm.lock'].find((l) => files.has(l));
      const lockText = lockName ? read(path.join(dir, lockName)) || '' : '';
      const block = /\bdependencies\s*=\s*\[([\s\S]*?)\]/.exec(t);
      if (block) for (const m of block[1].matchAll(/["']([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*([^"';]*)/g)) out.push({ eco: 'python', dir: rel, name: m[1], declared: m[3].trim() || '*', field: 'project.dependencies', locked: lockText ? tomlLocked(lockText, m[1]).join('/') : '', installed: '' });
      const rp = /^requires-python\s*=\s*"([^"]+)"/m.exec(t);
      if (rp) out.push({ eco: 'python', dir: rel, name: 'python (requires-python)', declared: rp[1], field: 'project', locked: '', installed: '' });
    }
    if (pj && pj.engines && (!opts.eco || opts.eco === 'node')) for (const [n, r] of Object.entries(pj.engines)) out.push({ eco: 'node', dir: rel, name: `${n} (engines)`, declared: r, field: 'engines', locked: '', installed: n === 'node' ? process.versions.node : '' });
  }
  return out;
}

function parseArgs(argv) {
  const o = { names: [], eco: null, root: '.', depth: 2, json: false, direct: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--json') o.json = true;
    else if (a === '--direct') o.direct = true;
    else if (a === '--eco') { o.eco = need(); if (!ECO_FNS[o.eco]) throw new Error(`unknown ecosystem ${o.eco}`); }
    else if (a === '--root') o.root = need();
    else if (a === '--depth') { o.depth = Number.parseInt(need(), 10); if (!(o.depth >= 0)) throw new Error('--depth must be >= 0'); }
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else o.names.push(a);
  }
  if (!o.help && !o.direct && !o.names.length) throw new Error('give at least one package name, or --direct');
  return o;
}

export function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(`pkg-info: ${e.message}\n\n${HELP}`); return 2; }
  if (o.help) { console.log(HELP); return 0; }
  const root = path.resolve(o.root);
  if (!isDir(root)) { console.error(`pkg-info: not a directory: ${root}`); return 2; }
  if (o.direct) {
    const rows = directDeps(root, o);
    if (o.json) console.log(JSON.stringify(rows, null, 2));
    else {
      if (!rows.length) console.log('No direct dependencies found (supported for --direct: node, php, rust, go, python/pyproject).');
      let cur = '';
      for (const r of rows) {
        const key = `${r.eco} ${r.dir}`;
        if (key !== cur) { console.log(`## ${r.eco} (${r.dir})`); cur = key; }
        const tail = [r.locked && `locked ${r.locked}`, r.installed && `installed ${r.installed}`].filter(Boolean).join(', ');
        console.log(`- ${r.name} ${r.declared}${tail ? ` (${tail})` : ''}${/^dev|dev-/.test(r.field) || r.field === 'require-dev' ? ' [dev]' : ''}`);
      }
    }
    return 0;
  }
  const all = [];
  let missing = 0;
  for (const n of o.names) {
    const r = lookup(root, n, o);
    if (!r.length) missing++;
    all.push({ name: n, found: r });
  }
  if (o.json) console.log(JSON.stringify(all, null, 2));
  else {
    for (const { name, found } of all) {
      if (!found.length) { console.log(`PKG ${name}: NOT FOUND in any manifest/lockfile under ${slash(root)} - check the spelling or the ecosystem (--eco), and do not assume a version`); continue; }
      for (const f of found) {
        if (f.error) { console.log(`PKG ${name} [${f.eco}] error: ${f.error}`); continue; }
        console.log(`PKG ${name} [${f.eco}] in ${f.dir}`);
        if (f.declared) console.log(`  declared : ${Array.isArray(f.declared) ? f.declared.map((d) => `${d.range} (${d.file})`).join('; ') : `${f.declared.range} (${f.declared.field || f.declared.file})${f.declared.indirect ? ' // indirect' : ''}`}`);
        if (f.locked) console.log(`  locked   : ${f.locked.versions.length ? f.locked.versions.join(', ') : '(not in lockfile)'} (${f.locked.lockfile})`);
        if (f.installed) console.log(`  installed: ${f.installed.version || '?'}${f.installed.path ? ` at ${f.installed.path}` : ''}${f.installed.cached ? ` (cached versions: ${f.installed.cached.join(', ')})` : ''}`);
        else console.log('  installed: not found locally');
        if (f.installed?.types) console.log(`  types    : ${f.installed.types}`);
        if (f.installed?.exports) console.log(`  exports  : ${f.installed.exports.join(' ')}`);
        if (f.installed?.docs?.length) console.log(`  bundled  : ${f.installed.docs.join(', ')}`);
        if (f.installed?.note) console.log(`  note     : ${f.installed.note}`);
        if (f.docs?.length) console.log(`  docs     : ${[...new Set(f.docs)].join(' | ')}`);
        if (f.hint) console.log(`  hint     : ${f.hint}`);
        for (const w of f.warnings || []) console.log(`  WARN     : ${w}`);
      }
    }
  }
  return missing ? 1 : 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  let code = 2;
  try { code = main(process.argv.slice(2)); } catch (e) { console.error(`pkg-info: internal error: ${e && e.message}`); code = 2; }
  process.exitCode = code;
}
