#!/usr/bin/env node
// kit-install.mjs: copy the reusable Frontier Kit (.agents/) into another repository.
// Never overwrites without --force; never overwrites project-owned files (AGENTS.md, lessons) at all.
// Zero dependencies, Node >= 18.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { walk, toPosix, isBinaryBuffer, IS_WIN } from './lib/walk.mjs';

const USAGE = `Usage: node .agents/scripts/kit-install.mjs --target <repoDir> [--dry-run] [--force] [--verbose]

Copy the reusable agent kit from this kit's .agents/ into <repoDir>/.agents/:
rules (except 90-lessons.md), guides, kit skills, agents, hooks + hooks.json, scripts, docs, GEMINI.md, README.md.
Then: create empty .agents/memory/lessons.md and .agents/rules/90-lessons.md skeletons, create AGENTS.md from a
template if absent, append missing .gitignore entries, and run .agents/scripts/activate-stack.mjs in the target.

Options:
  --target <dir>   repository to install into (must exist)
  --dry-run        print the plan; write nothing, run nothing
  --force          overwrite kit files that differ in the target (project-owned files are never overwritten:
                   AGENTS.md, .agents/memory/lessons.md, .agents/rules/90-lessons.md)
  --verbose        list every file, not only changes and conflicts
  --source <dir>   kit folder to copy from (default: the .agents/ folder that contains this script)
  -h, --help       show this help
The kit's third-party skills (skills-lock.json) are copied unmodified, plus skills-lock.json when the target has none.
Exit code: 0 = installed (or plan printed), 1 = conflicts kept or activate-stack failed, 2 = usage or internal error.
`;

// .agents/docs/architecture.md: the kit's own skills. Everything else under skills/ is not copied.
const KIT_SKILLS = [
  'orchestrate', 'verify', 'write-tests', 'e2e-test', 'research-docs', 'security-audit', 'reflect', 'capture-skill',
  'perf-audit', 'db-migration', 'upgrade-deps', 'commit-and-pr', 'onboard-repo', 'new-project', 'workspace-doctor', 'start',
];
// .agents/docs/architecture.md: third-party skills kept in this kit (skills-lock.json). Kit files link to them, so they
// are copied too (never edited).
const THIRD_PARTY_SKILLS = new Set([
  'architecture-decision-records', 'commit-archaeologist', 'seo-audit', 'thinking-out-loud', 'vercel-react-best-practices',
]);
// .agents/docs/architecture.md (roles): the orchestrator + worker roster. agents/ is copied whole; this list only reports gaps.
const KIT_AGENTS = [
  'orchestrator', 'explorer', 'docs-researcher', 'git-historian', 'planner', 'advisor', 'implementer', 'reviewer',
  'security-auditor', 'fixer', 'debugger', 'test-engineer', 'e2e-tester', 'scribe',
];
const COPY_DIRS = ['rules', 'guides', 'agents', 'hooks', 'scripts', 'docs'];
const COPY_FILES = ['hooks.json', 'GEMINI.md', 'README.md'];
const SKIP_DIR_NAMES = new Set(['.state', 'node_modules', '_drafts', '__pycache__', '.git']);
const SKIP_FILE = /(^\.DS_Store$|^Thumbs\.db$|\.tmp$|\.pyc$|\.log$)/;
const GITIGNORE_ENTRIES = ['.agents/.state/', '.scratch/', '/test-results/', '/playwright-report/', '/blob-report/', '/coverage/'];

const AGENTS_TEMPLATE = `# Project facts

> Always-on context for AI agents: keep it short (at most 3,500 bytes) and factual.
> Created by kit-install. Run \`/start\` to fill it in (it uses \`node .agents/scripts/repo-map.mjs\`),
> then delete this note. Every placeholder below is unverified until replaced.

## Stack
- Languages / frameworks: <fill in, e.g. PHP 8.3 + Laravel 11>
- Package manager: <fill in from the lockfile>
- Runtime versions: <fill in from .nvmrc, composer.json, rust-toolchain.toml, go.mod, ...>

## Commands (run from the repo root)
- Install: \`<fill in>\`
- Dev server: \`<fill in>\`
- Test: \`<fill in>\`
- Lint / format / typecheck: \`<fill in>\`
- Everything: \`node .agents/scripts/verify.mjs\`

## Layout
- \`<dir>/\`: <what lives there>

## Conventions
- <fill in: naming, error handling, test placement, import aliases>

## Never
- <fill in: e.g. never edit generated files in X; never run package manager Y>
`;

const LESSONS_FALLBACK_HEADER = `# Lessons ledger

Append-only memory of verified, reusable lessons for this workspace. It is NOT always-on: search it before planning.
- Search: \`node .agents/scripts/lessons.mjs search <query>\` or \`node .agents/scripts/lessons.mjs list --scope <scope>\`
- Add: \`node .agents/scripts/lessons.mjs add --scope <scope> --text "When X, do Y because Z" --evidence "<where>"\`
- Vote: \`node .agents/scripts/lessons.mjs vote <id> helpful|harmful\` (never edit the counters by hand).
- Line format: \`- [L-NNNN] scope:<scope> | +<helpful> -<harmful> | <YYYY-MM-DD> | <lesson> | evidence: <where>\`
- Promotion: helpful >= 2 and harmful 0 -> \`.agents/rules/90-lessons.md\` via \`/reflect\`.
`;

const CURATED_FALLBACK = `---
trigger: always_on
description: "Curated, verified lessons for this workspace, promoted from .agents/memory/lessons.md. Maintained by /reflect."
---
# Curated lessons

Promoted from \`.agents/memory/lessons.md\` (helpful >= 2 and harmful 0, or a verified high-severity fact). Keep this file at most 4 KB. Change it only through \`/reflect\`.

## Platform (Antigravity)
- None recorded yet.

## Project
- None recorded yet.

## Tooling
- None recorded yet.

## User preferences
- None recorded yet.
`;

class UsageError extends Error {}

function parseArgs(argv) {
  const o = { target: null, source: null, dryRun: false, force: false, verbose: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline;
    if (a.startsWith('--') && a.includes('=')) {
      inline = a.slice(a.indexOf('=') + 1);
      a = a.slice(0, a.indexOf('='));
    }
    const value = () => {
      if (inline !== undefined) return inline;
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new UsageError(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--dry-run' || a === '-n') o.dryRun = true;
    else if (a === '--force' || a === '-f') o.force = true;
    else if (a === '--verbose' || a === '-v') o.verbose = true;
    else if (a === '--target' || a === '-t') o.target = value();
    else if (a === '--source') o.source = value();
    else throw new UsageError(`unknown argument "${argv[i]}" (see --help)`);
  }
  return o;
}

const norm = (p) => (IS_WIN ? path.resolve(p).toLowerCase() : path.resolve(p));
const isInside = (child, parent) => {
  const rel = path.relative(norm(parent), norm(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};
const readOr = (abs, fallback = null) => {
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return fallback;
  }
};
const eolNormalize = (s) => s.replace(/\r\n/g, '\n');

// Header of the source ledger (everything before "## Active"), minus lines about specific lessons.
function lessonsSkeleton(srcKit) {
  const src = readOr(path.join(srcKit, 'memory', 'lessons.md'), '');
  const idx = src.search(/^## Active\s*$/m);
  let header = LESSONS_FALLBACK_HEADER;
  if (idx > 0 && /^# /.test(src)) {
    header = eolNormalize(src.slice(0, idx)).split('\n').filter((l) => !/\bL-\d{4}\b/.test(l)).join('\n');
  }
  return header.replace(/\n*$/, '\n\n') + '## Active\n\n## Retired\n';
}

// Frontmatter, title, intro and section headings of the source curated file, without any lessons.
function curatedSkeleton(srcKit) {
  const src = eolNormalize(readOr(path.join(srcKit, 'rules', '90-lessons.md'), ''));
  const fm = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm || !/^trigger:\s*always_on\s*$/m.test(fm[1]) || !/^description:/m.test(fm[1])) return CURATED_FALLBACK;
  const body = src.slice(fm[0].length).split('\n');
  const out = [fm[0].trimEnd()];
  let sections = 0;
  let inSection = false;
  for (const line of body) {
    if (/^---\s*$/.test(line)) break; // footer (repeats specific lessons)
    if (/^## /.test(line)) {
      if (inSection) out.push('- None recorded yet.', '');
      out.push(line);
      inSection = true;
      sections++;
      continue;
    }
    if (inSection) continue; // drop section bodies (the lessons themselves)
    if (/\bL-\d{4}\b/.test(line)) continue;
    out.push(line);
  }
  if (inSection) out.push('- None recorded yet.');
  if (!sections) return CURATED_FALLBACK;
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n');
}

function gitignorePlan(targetAbs) {
  const file = path.join(targetAbs, '.gitignore');
  const existing = readOr(file, null);
  const key = (l) => l.trim().replace(/^\//, '').replace(/\/\*\*$/, '').replace(/\/$/, '');
  const have = new Set((existing || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map(key));
  const missing = GITIGNORE_ENTRIES.filter((e) => !have.has(key(e)));
  return { file, existing, missing };
}

function applyGitignore(plan) {
  const eol = plan.existing && plan.existing.includes('\r\n') ? '\r\n' : '\n';
  let text = plan.existing || '';
  if (text && !text.endsWith('\n')) text += eol;
  if (text) text += eol;
  text += ['# Frontier Kit (agent workspace)', ...plan.missing].join(eol) + eol;
  fs.writeFileSync(plan.file, text);
}

function sameContent(srcBuf, destAbs, rel) {
  let destBuf;
  try {
    destBuf = fs.readFileSync(destAbs);
  } catch {
    return false;
  }
  if (srcBuf.equals(destBuf)) return true;
  if (isBinaryBuffer(srcBuf) || isBinaryBuffer(destBuf)) return false;
  let a = eolNormalize(srcBuf.toString('utf8'));
  let b = eolNormalize(destBuf.toString('utf8'));
  if (/^\.agents\/rules\/fw-[^/]+\.md$/.test(rel)) {
    // activate-stack flips only the trigger line of framework packs: ignore that difference.
    a = a.replace(/^trigger:.*$/m, 'trigger: *');
    b = b.replace(/^trigger:.*$/m, 'trigger: *');
  }
  return a === b;
}

function buildPlan(srcKit, targetAbs, force) {
  const items = []; // { rel, src?, content?, owned, status }
  const notes = [];
  const add = (rel, source, owned = false) => {
    const destAbs = path.join(targetAbs, rel);
    const buf = source.src ? fs.readFileSync(source.src) : Buffer.from(source.content, 'utf8');
    let status;
    if (!fs.existsSync(destAbs)) status = 'CREATE';
    else if (owned) status = 'KEEP';
    else if (sameContent(buf, destAbs, rel)) status = 'SAME';
    else status = force ? 'OVERWRITE' : 'CONFLICT';
    items.push({ rel, destAbs, buf, owned, status });
  };
  const skipDir = (name) => SKIP_DIR_NAMES.has(name);
  for (const d of COPY_DIRS) {
    const abs = path.join(srcKit, d);
    if (!fs.existsSync(abs)) {
      notes.push(`source has no .agents/${d}/ (skipped)`);
      continue;
    }
    for (const e of walk(abs, { ignore: false, skipDir })) {
      if (SKIP_FILE.test(e.name)) continue;
      if (d === 'rules' && (e.rel.includes('/') || e.rel === '90-lessons.md')) continue; // rules are flat
      add(`.agents/${d}/${e.rel}`, { src: e.abs });
    }
  }
  for (const f of COPY_FILES) {
    const abs = path.join(srcKit, f);
    if (fs.existsSync(abs)) add(`.agents/${f}`, { src: abs });
    else notes.push(`source has no .agents/${f} (skipped)`);
  }
  const skillsDir = path.join(srcKit, 'skills');
  const present = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name)
    : [];
  const missing = [];
  for (const name of KIT_SKILLS) {
    if (!present.includes(name) || !fs.existsSync(path.join(skillsDir, name, 'SKILL.md'))) {
      missing.push(name);
      continue;
    }
    for (const e of walk(path.join(skillsDir, name), { ignore: false, skipDir })) {
      if (!SKIP_FILE.test(e.name)) add(`.agents/skills/${name}/${e.rel}`, { src: e.abs });
    }
  }
  if (missing.length) notes.push(`kit skills missing in the source (skipped): ${missing.join(', ')}`);
  const agentsDir = path.join(srcKit, 'agents');
  const missingAgents = KIT_AGENTS.filter((n) => !fs.existsSync(path.join(agentsDir, `${n}.md`))
    && !fs.existsSync(path.join(agentsDir, n, 'agent.md')));
  if (fs.existsSync(agentsDir) && missingAgents.length) notes.push(`kit agents missing in the source: ${missingAgents.join(', ')}`);
  const third = present.filter((n) => THIRD_PARTY_SKILLS.has(n) && fs.existsSync(path.join(skillsDir, n, 'SKILL.md')));
  for (const name of third) {
    for (const e of walk(path.join(skillsDir, name), { ignore: false, skipDir })) {
      if (!SKIP_FILE.test(e.name)) add(`.agents/skills/${name}/${e.rel}`, { src: e.abs });
    }
  }
  if (third.length) notes.push(`third-party skills copied (do not edit; sources in skills-lock.json): ${third.join(', ')}`);
  const lock = path.join(path.dirname(srcKit), 'skills-lock.json');
  if (third.length && fs.existsSync(lock)) add('skills-lock.json', { src: lock }, true);
  const other = present.filter((n) => !THIRD_PARTY_SKILLS.has(n) && !KIT_SKILLS.includes(n) && n !== '_drafts');
  if (other.length) notes.push(`not copied (not in the kit skill list): ${other.join(', ')}`);

  add('.agents/rules/90-lessons.md', { content: curatedSkeleton(srcKit) }, true);
  add('.agents/memory/lessons.md', { content: lessonsSkeleton(srcKit) }, true);
  add('AGENTS.md', { content: AGENTS_TEMPLATE }, true);
  return { items, notes };
}

function area(rel) {
  const segs = rel.split('/');
  if (segs[0] !== '.agents') return rel;
  if (segs.length === 2) return '.agents/' + segs[1];
  return `.agents/${segs[1]}/`;
}

function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`kit-install: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
  if (o.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (!o.target) {
    process.stderr.write('kit-install: --target <repoDir> is required (see --help)\n');
    return 2;
  }
  const srcKit = path.resolve(o.source || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const targetAbs = path.resolve(o.target);
  const fail = (msg) => {
    process.stderr.write(`kit-install: ${msg}\n`);
    return 2;
  };
  if (!fs.existsSync(path.join(srcKit, 'rules')) && !fs.existsSync(path.join(srcKit, 'scripts'))) {
    return fail(`source is not a kit folder (no rules/ or scripts/): ${toPosix(srcKit)}`);
  }
  let tst;
  try {
    tst = fs.statSync(targetAbs);
  } catch {
    return fail(`target does not exist: ${toPosix(targetAbs)} (create it first)`);
  }
  if (!tst.isDirectory()) return fail(`target is not a directory: ${toPosix(targetAbs)}`);
  const targetKit = path.join(targetAbs, '.agents');
  if (norm(targetKit) === norm(srcKit) || norm(targetAbs) === norm(path.dirname(srcKit))) {
    return fail('target is the source repository itself');
  }
  if (isInside(targetKit, srcKit) || isInside(srcKit, targetKit)) {
    return fail('target and source kit folders overlap');
  }

  const { items, notes } = buildPlan(srcKit, targetAbs, o.force);
  const gi = gitignorePlan(targetAbs);
  const activate = path.join(targetKit, 'scripts', 'activate-stack.mjs');
  const willHaveActivate = fs.existsSync(activate) || items.some((i) => i.rel === '.agents/scripts/activate-stack.mjs');
  const counts = { CREATE: 0, OVERWRITE: 0, CONFLICT: 0, SAME: 0, KEEP: 0 };
  for (const it of items) counts[it.status]++;

  const L = [];
  L.push(`kit-install: ${toPosix(srcKit)} -> ${toPosix(targetAbs)}${o.dryRun ? ' (dry run: nothing is written)' : ''}`);
  for (const it of items) {
    const listed = o.verbose || it.status === 'OVERWRITE' || it.status === 'CONFLICT' ||
      (o.dryRun && it.status === 'CREATE') || (it.owned && it.status !== 'SAME');
    if (!listed) continue;
    const why = it.status === 'CONFLICT' ? ' (differs; kept the target version, use --force to overwrite)'
      : it.status === 'KEEP' ? ' (project-owned; never overwritten)' : '';
    L.push(`  ${it.status.padEnd(9)} ${it.rel}${why}`);
  }
  if (!o.verbose) {
    const byArea = new Map();
    for (const it of items) {
      const k = area(it.rel);
      if (!byArea.has(k)) byArea.set(k, { CREATE: 0, OVERWRITE: 0, CONFLICT: 0, SAME: 0, KEEP: 0 });
      byArea.get(k)[it.status]++;
    }
    L.push('  by area:');
    for (const [k, c] of byArea) {
      const parts = Object.entries(c).filter(([, n]) => n).map(([s, n]) => `${s.toLowerCase()} ${n}`);
      L.push(`    ${k}: ${parts.join(', ')}`);
    }
  }
  L.push(gi.missing.length ? `  .gitignore: append ${gi.missing.join(' ')}` : '  .gitignore: entries already present');
  for (const n of notes) L.push(`  note: ${n}`);

  if (o.dryRun) {
    L.push(willHaveActivate
      ? '  activate-stack: would run `node .agents/scripts/activate-stack.mjs` in the target'
      : '  activate-stack: not available in the kit (skipped)');
    L.push(`KIT-INSTALL: DRY RUN (create ${counts.CREATE}, overwrite ${counts.OVERWRITE}, conflict ${counts.CONFLICT}, same ${counts.SAME}, keep ${counts.KEEP})`);
    process.stdout.write(L.join('\n') + '\n');
    return 0;
  }

  let writeErrors = 0;
  for (const it of items) {
    if (it.status !== 'CREATE' && it.status !== 'OVERWRITE') continue;
    try {
      fs.mkdirSync(path.dirname(it.destAbs), { recursive: true });
      fs.writeFileSync(it.destAbs, it.buf);
    } catch (e) {
      writeErrors++;
      L.push(`  ERROR     ${it.rel}: ${e.message}`);
    }
  }
  if (gi.missing.length) {
    try {
      applyGitignore(gi);
    } catch (e) {
      writeErrors++;
      L.push(`  ERROR     .gitignore: ${e.message}`);
    }
  }

  let activateOk = true;
  if (fs.existsSync(activate)) {
    const r = spawnSync(process.execPath, [activate], { cwd: targetAbs, encoding: 'utf8', timeout: 120000, windowsHide: true });
    activateOk = !r.error && r.status === 0;
    const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split(/\r?\n/).filter(Boolean).slice(-20);
    L.push(`  activate-stack: ${activateOk ? 'ok' : `FAILED (exit ${r.status ?? 'none'}${r.error ? ', ' + r.error.message : ''})`}`);
    for (const line of out) L.push(`    ${line}`);
    if (!activateOk) L.push('    run it yourself: node .agents/scripts/activate-stack.mjs (from the target repo root)');
  } else {
    L.push('  activate-stack: not found in the target kit (skipped)');
  }
  L.push('  next: open the target in Antigravity and run /start (reads the codebase, fills AGENTS.md, sets up git hygiene)');
  const summary = `create ${counts.CREATE}, overwrite ${counts.OVERWRITE}, conflict ${counts.CONFLICT}, same ${counts.SAME}, keep ${counts.KEEP}`;
  let code = 0;
  if (writeErrors) {
    L.push(`KIT-INSTALL: FAIL (${writeErrors} write errors; ${summary})`);
    code = 1;
  } else if (counts.CONFLICT) {
    L.push(`KIT-INSTALL: INCOMPLETE (${counts.CONFLICT} conflicts kept; re-run with --force to overwrite; ${summary})`);
    code = 1;
  } else if (!activateOk) {
    L.push(`KIT-INSTALL: FILES OK, ACTIVATE-STACK FAILED (${summary})`);
    code = 1;
  } else {
    L.push(`KIT-INSTALL: OK (${summary})`);
  }
  process.stdout.write(L.join('\n') + '\n');
  return code;
}

process.stdout.on('error', (e) => {
  if (e && e.code === 'EPIPE') process.exit(0);
});

try {
  process.exitCode = main();
} catch (err) {
  process.stderr.write(`kit-install: internal error: ${err && err.message ? err.message : String(err)}\n`);
  process.exitCode = 2;
}
