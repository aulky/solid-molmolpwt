#!/usr/bin/env node
// activate-stack.mjs — detect frameworks from manifests and flip `.agents/rules/fw-*.md` triggers
// (.agents/docs/architecture.md): detected → `trigger: glob`, otherwise `trigger: model_decision`. Only the trigger line
// changes (every other byte is preserved); `globs:` stays. Writes .agents/.state/stack.json.
// A trigger line ending in a `# pin` / `# pinned` comment is never changed (manual override).
// Node >= 18, ESM, zero dependencies. Exit: 0 success, 2 usage/internal error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findManifestDirs, projectRoots, detectFrameworks, detectPackageManager, isDir, toPosix, FRAMEWORK_IDS,
} from './lib/stacks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');

const USAGE = `Usage: node .agents/scripts/activate-stack.mjs [--dry-run] [--json] [--root <dir>]

Detects frameworks from manifests (package.json deps, composer.json, Cargo.toml, go.mod, pyproject/requirements,
Gemfile, mix.exs, pubspec.yaml, pom.xml/build.gradle, *.csproj) up to depth 3, then for every
.agents/rules/fw-<id>.md sets "trigger: glob" when <id> is detected, else "trigger: model_decision".
Only the trigger line is rewritten. Add "# pinned" after the value to keep a trigger as-is.
Writes .agents/.state/stack.json (packageManager, stacks, roots, frameworks, evidence).

Options:
  --dry-run      report what would change; write nothing
  --json         print the result as JSON
  --root <dir>   project root (default: the repo containing .agents/scripts/activate-stack.mjs)
  -h, --help     show this help
Framework ids: ${FRAMEWORK_IDS.join(', ')}`;

class UsageError extends Error {}

function parseArgs(argv) {
  const o = { dryRun: false, json: false, root: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--json') o.json = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--root' || a.startsWith('--root=')) {
      let v;
      if (a.includes('=')) v = a.slice(a.indexOf('=') + 1);
      else { i += 1; v = argv[i]; }
      if (!v) throw new UsageError('--root needs a directory');
      o.root = v;
    } else throw new UsageError(`unknown option: ${a}`);
  }
  return o;
}

/**
 * Rewrite the frontmatter `trigger:` value of a rule file. Works on raw bytes (latin1 view) so every other byte
 * is preserved exactly (BOM, CRLF, non-UTF-8). Returns { from, to, changed, pinned, buffer, error }.
 */
export function setTrigger(buf, want) {
  const s = buf.toString('latin1');
  const bom = s.startsWith('\xEF\xBB\xBF') ? 3 : 0;
  const lines = s.slice(bom).split(/(?<=\n)/);
  const bare = (l) => l.replace(/\r?\n$/, '');
  if (!lines.length || !/^---[ \t]*$/.test(bare(lines[0]))) return { error: 'no YAML frontmatter' };
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) if (/^---[ \t]*$/.test(bare(lines[i]))) { end = i; break; }
  if (end < 0) return { error: 'unterminated YAML frontmatter' };
  for (let i = 1; i < end; i += 1) {
    const line = bare(lines[i]);
    const m = /^(trigger[ \t]*:[ \t]*)(["']?)([A-Za-z_]*)\2([ \t]*(?:#.*)?)$/.exec(line);
    if (!m) continue;
    const from = m[3];
    const pinned = /#\s*pin/i.test(m[4]);
    if (pinned || from === want) return { from, to: from, changed: false, pinned, buffer: buf };
    const eol = lines[i].slice(line.length);
    lines[i] = `${m[1]}${m[2]}${want}${m[2]}${m[4]}${eol}`;
    const text = s.slice(0, bom) + lines.join('');
    return { from, to: want, changed: true, pinned: false, buffer: Buffer.from(text, 'latin1') };
  }
  return { error: 'no top-level "trigger:" line in frontmatter' };
}

function atomicWrite(file, data) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, data);
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.writeFileSync(file, data);
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) {
    if (e instanceof UsageError) { process.stderr.write(`activate-stack: ${e.message}\n\n${USAGE}\n`); return 2; }
    throw e;
  }
  if (opts.help) { process.stdout.write(`${USAGE}\n`); return 0; }
  const repoRoot = path.resolve(opts.root || DEFAULT_ROOT);
  if (!isDir(repoRoot)) { process.stderr.write(`activate-stack: root is not a directory: ${repoRoot}\n`); return 2; }

  const dirs = findManifestDirs(repoRoot, 3);
  const roots = projectRoots(dirs);
  const fw = detectFrameworks(dirs);
  const rootInfo = roots.map((r) => {
    const info = { dir: r.rel, stacks: r.stacks };
    if (r.stacks.includes('node')) info.pm = detectPackageManager(r.dir, repoRoot).pm;
    return info;
  });
  const stacks = [...new Set(rootInfo.flatMap((r) => r.stacks))];
  if (isDir(path.join(repoRoot, '.agents'))) stacks.push('agent-kit');
  const nodeRoot = rootInfo.find((r) => r.dir === '.' && r.pm) || rootInfo.find((r) => r.pm);

  const rulesDir = path.join(repoRoot, '.agents', 'rules');
  const ruleFiles = isDir(rulesDir) ? fs.readdirSync(rulesDir).filter((f) => /^fw-.+\.md$/.test(f)).sort() : [];
  const rules = [];
  const warnings = [];
  for (const file of ruleFiles) {
    const id = file.slice(3, -3);
    const want = fw.ids.includes(id) ? 'glob' : 'model_decision';
    const full = path.join(rulesDir, file);
    let res;
    try { res = setTrigger(fs.readFileSync(full), want); } catch (e) { res = { error: e.message }; }
    if (res.error) {
      warnings.push(`${file}: ${res.error} — left unchanged`);
      rules.push({ file, id, want, from: null, to: null, changed: false, error: res.error });
      continue;
    }
    if (res.changed && !opts.dryRun) atomicWrite(full, res.buffer);
    rules.push({ file, id, want, from: res.from, to: res.to, changed: res.changed, ...(res.pinned ? { pinned: true } : {}) });
  }
  const withoutRule = fw.ids.filter((id) => !ruleFiles.includes(`fw-${id}.md`));
  if (!isDir(rulesDir)) warnings.push('no .agents/rules directory — nothing to activate');

  const state = {
    v: 1, ts: Date.now(), root: toPosix(repoRoot), packageManager: nodeRoot ? nodeRoot.pm : null, stacks,
    roots: rootInfo, frameworks: fw.ids, evidence: fw.evidence,
    rules: rules.map(({ file, to, changed, pinned }) => ({ file, trigger: to, changed, ...(pinned ? { pinned } : {}) })),
    verify: 'node .agents/scripts/verify.mjs',
  };
  let stateFile = null;
  if (!opts.dryRun) {
    const dir = path.join(repoRoot, '.agents', '.state');
    fs.mkdirSync(dir, { recursive: true });
    stateFile = path.join(dir, 'stack.json');
    atomicWrite(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ dryRun: opts.dryRun, ...state, frameworksWithoutRule: withoutRule, warnings, rules }, null, 2)}\n`);
    return 0;
  }
  const say = (l) => process.stdout.write(`${l}\n`);
  say(`stacks: ${stacks.join(', ') || 'none'}${state.packageManager ? ` (package manager: ${state.packageManager})` : ''}`);
  say(`frameworks: ${fw.ids.length ? fw.ids.map((id) => `${id} [${fw.evidence[id][0]}]`).join(', ') : 'none detected'}`);
  for (const r of rules) {
    if (r.error) continue;
    const note = r.pinned ? ' (pinned)' : '';
    say(r.changed ? `${r.file}: ${r.from} -> ${r.to}${opts.dryRun ? ' (dry run)' : ''}` : `${r.file}: ${r.to} (unchanged)${note}`);
  }
  if (withoutRule.length) say(`detected without an fw-*.md rule: ${withoutRule.join(', ')}`);
  for (const w of warnings) say(`warning: ${w}`);
  const n = rules.filter((r) => r.changed).length;
  say(opts.dryRun ? `dry run: ${n} rule file(s) would change; nothing written`
    : `updated ${n} rule file(s); wrote ${toPosix(path.relative(repoRoot, stateFile))}`);
  return 0;
}

// Run as a CLI unless imported (tests may import setTrigger). The basename check keeps the CLI working when
// argv[1] differs only by case, symlink or 8.3 short name on Windows.
const isMain = (() => {
  try {
    const argv1 = process.argv[1] || '';
    if (path.basename(argv1).toLowerCase() === 'activate-stack.mjs') return true;
    const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
    return norm(fs.realpathSync(argv1)) === norm(fs.realpathSync(fileURLToPath(import.meta.url)));
  } catch { return false; }
})();
if (isMain) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`activate-stack: internal error: ${e && e.stack ? e.stack : e}\n`);
    process.exitCode = 2;
  }
}
