#!/usr/bin/env node
// check-agents-md.mjs - validate a root AGENTS.md written by /onboard-repo against the repo it describes.
// Zero dependencies, Node >= 18, ESM. Part of the Frontier Kit onboard-repo skill.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HELP = `Usage: node .agents/skills/onboard-repo/scripts/check-agents-md.mjs [file] [--root <dir>] [--max-bytes <n>] [--json]

Checks the project-facts file (default: AGENTS.md in --root, default cwd):
  ERROR  missing file, over the byte cap (default 3500), YAML frontmatter present, unfilled
         <fill ...> / <fill: ...> placeholders, a required section missing (Stack, Commands, Layout,
         Conventions), a "<pm> run <script>" command whose script is not in package.json, a package
         manager that contradicts the lockfile
  WARN   no "## Gotchas"/"## Never" section and no gotcha-style wording under Conventions either,
         backticked repo paths that do not exist (generated dirs may be fine), dependency versions
         that differ from package.json/lockfile, TODO/TBD markers, very long lines
Exit codes: 0 = no errors (warnings allowed), 1 = errors, 2 = usage/internal error.`;

// Hard-required headings. A fifth topic - non-obvious pitfalls ("gotchas": stale lockfiles, platform
// quirks, broken tools, "never do X") - is checked softly below: either its own "## Gotchas"/"## Never"
// heading (kit-install.mjs's skeleton uses "## Never") or gotcha-style wording folded into Conventions
// both satisfy it, matching how a typical root AGENTS.md is written.
export const REQUIRED = ['Stack', 'Commands', 'Layout', 'Conventions'];
const GOTCHA_SIGNAL = /\b(never|not a git|stale|avoid|do not|don't|broken|missing|NEVER)\b/i;
const PM_BY_LOCK = [['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['package-lock.json', 'npm']];

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const readJson = (p) => { const t = read(p); try { return t == null ? null : JSON.parse(t); } catch { return null; } };

function lockedVersion(root, name) {
  const bun = read(path.join(root, 'bun.lock'));
  if (bun) { const m = new RegExp(`"${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}": \\["${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}@([^"]+)"`).exec(bun); if (m) return m[1]; }
  const pl = readJson(path.join(root, 'package-lock.json'));
  if (pl && pl.packages && pl.packages[`node_modules/${name}`]) return pl.packages[`node_modules/${name}`].version;
  const ipj = readJson(path.join(root, 'node_modules', ...name.split('/'), 'package.json'));
  return ipj ? ipj.version : null;
}

export function check(text, root, maxBytes = 3500) {
  const errors = []; const warnings = [];
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > maxBytes) errors.push(`size ${bytes} B > cap ${maxBytes} B - cut generic text first, then layout detail`);
  if (/^\uFEFF?---\s*\r?\n/.test(text)) errors.push('YAML frontmatter found - a standalone AGENTS.md takes none (it would be shown as text every turn)');
  const lines = text.split(/\r?\n/);
  const FILL_RE = /<fill\b[:\s]?[^>]*>/i;
  lines.forEach((l, i) => {
    if (FILL_RE.test(l)) errors.push(`line ${i + 1}: unfilled placeholder ${(FILL_RE.exec(l) || [''])[0].slice(0, 60)}`);
    if (/\b(TODO|TBD|FIXME)\b/.test(l)) warnings.push(`line ${i + 1}: TODO/TBD marker - replace with a fact or delete the line`);
    if (l.length > 220) warnings.push(`line ${i + 1}: ${l.length} chars - split or shorten`);
  });
  const headings = lines.filter((l) => /^##\s+/.test(l)).map((l) => l.replace(/^##\s+/, '').trim().toLowerCase());
  for (const r of REQUIRED) if (!headings.some((h) => h.startsWith(r.toLowerCase()))) errors.push(`missing section "## ${r}"`);
  if (!headings.some((h) => h.startsWith('gotcha') || h.startsWith('never'))) {
    const idx = headings.indexOf('conventions');
    const start = lines.findIndex((l) => /^##\s+conventions/i.test(l));
    const nextHeadingOffset = start >= 0 ? lines.slice(start + 1).findIndex((l) => /^##\s+/.test(l)) : -1;
    const end = start >= 0 ? (nextHeadingOffset >= 0 ? start + 1 + nextHeadingOffset : lines.length) : -1;
    const conventionsText = start >= 0 ? lines.slice(start, end).join('\n') : '';
    if (idx === -1 || !GOTCHA_SIGNAL.test(conventionsText)) {
      warnings.push('no "## Gotchas" or "## Never" section, and no gotcha-style wording ("never", "stale", "avoid", ...) found under Conventions - add the non-obvious pitfalls somewhere');
    }
  }

  const pj = readJson(path.join(root, 'package.json'));
  const scripts = pj && pj.scripts ? pj.scripts : {};
  const code = [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim());
  for (const c of code) {
    const m = /^(npm|pnpm|yarn|bun)\s+run\s+([A-Za-z0-9:_.-]+)/.exec(c);
    if (m && pj && !(m[2] in scripts)) errors.push(`\`${c}\`: script "${m[2]}" is not defined in package.json`);
  }
  const lockPm = PM_BY_LOCK.find(([f]) => fs.existsSync(path.join(root, f)));
  if (lockPm && pj) {
    const [lockFile, pm] = lockPm;
    for (const c of code) {
      const m = /^(npm|pnpm|yarn|bun)\s+(install|i|add|run|ci|remove|exec|x|dlx)\b/.exec(c);
      if (m && m[1] !== pm) {
        const negated = lines.some((l) => l.includes(c) && /\b(never|not|don't|do not|stale|avoid)\b/i.test(l));
        if (!negated) errors.push(`\`${c}\` uses ${m[1]} but the canonical lockfile is ${lockFile} (${pm})`);
      }
    }
  }
  for (const c of code) {
    if (/[\s*?<>{}$|]/.test(c) || /^[a-z]+:\/\//i.test(c) || c.startsWith('~') || c.startsWith('-')) continue;
    if (!/\//.test(c) && !/\.[A-Za-z0-9]{1,6}$/.test(c)) continue;
    if (/^@?[a-z0-9-]+\/[a-z0-9-]+$/i.test(c) && !fs.existsSync(path.join(root, c))) continue; // package name like @solidjs/start
    if (/^[A-Za-z0-9_.-]+\.[a-z]{2,}$/.test(c) && /^(?:[a-z0-9-]+\.)+(?:com|dev|org|io|net|app)$/i.test(c)) continue; // domain
    const p = c.replace(/^\.\//, '').replace(/:\d+(?::\d+)?$/, '');
    if (!fs.existsSync(path.join(root, p))) warnings.push(`\`${c}\` does not exist in the repo (fine only if it is generated, e.g. a build output)`);
  }
  if (pj) {
    const deps = { ...(pj.dependencies || {}), ...(pj.devDependencies || {}) };
    for (const [name, range] of Object.entries(deps)) {
      const esc = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
      const re = new RegExp(`(?:^|[\\s\`(])${esc}\`?\\s+\`?([~^>=<]*\\d+(?:\\.[0-9A-Za-z-]+){0,3})`, 'g');
      for (const m of text.matchAll(re)) {
        const v = m[1];
        const locked = lockedVersion(root, name);
        const bare = v.replace(/^[~^>=<]+/, '');
        const ok = v === range || bare === range.replace(/^[~^>=<]+/, '') || (locked && bare === locked) || (locked && locked.startsWith(`${bare}.`)) || range.replace(/^[~^>=<]+/, '').startsWith(bare);
        if (!ok) warnings.push(`${name} written as ${v}, but package.json declares ${range}${locked ? ` (locked ${locked})` : ''}`);
      }
    }
  }
  return { bytes, errors, warnings };
}

function parseArgs(argv) {
  const o = { file: null, root: '.', max: 3500, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--json') o.json = true;
    else if (a === '--root') o.root = need();
    else if (a === '--max-bytes') { o.max = Number.parseInt(need(), 10); if (!(o.max > 0)) throw new Error('--max-bytes must be a positive integer'); }
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else if (!o.file) o.file = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  return o;
}

export function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(`check-agents-md: ${e.message}\n\n${HELP}`); return 2; }
  if (o.help) { console.log(HELP); return 0; }
  const root = path.resolve(o.root);
  const file = path.resolve(root, o.file || 'AGENTS.md');
  const text = read(file);
  const res = text == null ? { bytes: 0, errors: [`${file} not found - create it from .agents/skills/onboard-repo/references/agents-md-template.md`], warnings: [] } : check(text, root, o.max);
  if (o.json) console.log(JSON.stringify({ file: file.split(path.sep).join('/'), ...res }, null, 2));
  else {
    for (const e of res.errors) console.log(`ERROR ${e}`);
    for (const w of res.warnings) console.log(`WARN  ${w}`);
    console.log(`AGENTS-MD: ${res.errors.length ? 'FAIL' : 'PASS'} (${res.bytes} B, ${res.errors.length} errors, ${res.warnings.length} warnings)`);
  }
  return res.errors.length ? 1 : 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  let code = 2;
  try { code = main(process.argv.slice(2)); } catch (e) { console.error(`check-agents-md: internal error: ${e && e.message}`); code = 2; }
  process.exitCode = code;
}
