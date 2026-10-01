#!/usr/bin/env node
// detect.mjs - read-only first-run survey for the /start skill: decides the mode (new | existing | onboarded)
// and lists what the first-run setup still needs. Zero dependencies, Node >= 18, ESM.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findManifestDirs, projectRoots, detectFrameworks, detectPackageManager, toPosix } from '../../../scripts/lib/stacks.mjs';
import { gitStatus } from '../../../scripts/commit-msg.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..', '..', '..');

const USAGE = `Usage: node .agents/skills/start/scripts/detect.mjs [--root <dir>] [--json]

Read-only. Surveys the workspace for /start and prints:
  mode       new (only kit files at the root: scaffold a project here), existing (project files, AGENTS.md
             missing or still the template: onboard), onboarded (AGENTS.md filled in: refresh and health check)
  project    top-level project entries, stacks, package manager, frameworks
  AGENTS.md  missing | template | filled
  git        repository?, commit count, remotes, identity (from git config), commit-msg hook status
  e2e        Playwright config / dependency present?, UI framework detected?
  lessons    kit seed lessons that describe one machine (confirm they still hold)
  next       the playbook to run
Exit codes: 0 = surveyed, 2 = usage or internal error.`;

// Entries that belong to the kit, tooling or the OS, not to a project.
const KIT_ENTRIES = new Set(['.agents', 'AGENTS.md', '.gitignore', '.gitattributes', 'skills-lock.json', '.git', '.claude',
  '.vscode', '.idea', '.scratch', '.DS_Store', 'Thumbs.db', '.editorconfig', 'LICENSE', 'LICENSE.md', 'LICENSE.txt']);
const UI_FRAMEWORKS = new Set(['react', 'nextjs', 'solidjs', 'solid-start', 'astro', 'vue', 'nuxt', 'svelte', 'sveltekit',
  'angular', 'laravel', 'tailwind']);
const MACHINE_SCOPES = new Set(['tooling', 'user']);

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? (r.stdout || '').trim() : null;
}

/** The kit's own README counts as a kit file; any other README belongs to a project. */
function isKitReadme(root) {
  const t = read(path.join(root, 'README.md'));
  return t !== null && /^# Antigravity Frontier Kit\b/m.test(t);
}

export function agentsMdState(root) {
  const t = read(path.join(root, 'AGENTS.md'));
  if (t === null) return 'missing';
  if (/<fill\b[:\s]?[^>]*>/i.test(t) || /Template from the Frontier Kit|Created by kit-install/.test(t)) return 'template';
  return 'filled';
}

export function projectEntries(root) {
  let names = [];
  try { names = fs.readdirSync(root); } catch { return []; }
  const kitReadme = isKitReadme(root);
  return names.filter((n) => !KIT_ENTRIES.has(n) && !(n === 'README.md' && kitReadme)).sort();
}

function seedLessons(root) {
  const t = read(path.join(root, '.agents', 'memory', 'lessons.md')) || '';
  const active = t.split(/^## Retired\s*$/m)[0];
  const out = [];
  for (const m of active.matchAll(/^- \[(L-\d{4})\] scope:([\w-]+) \| [^|]+\| [^|]+\| ([^|]+)\|/gm)) {
    if (MACHINE_SCOPES.has(m[2])) out.push({ id: m[1], scope: m[2], text: m[3].trim() });
  }
  return out;
}

function e2eState(root, frameworks) {
  let config = null;
  try {
    config = fs.readdirSync(root).find((n) => /^playwright\.config\.(ts|js|mjs|cjs|mts)$/.test(n)) || null;
  } catch { /* none */ }
  const pkg = read(path.join(root, 'package.json'));
  const dependency = !!pkg && /"@playwright\/test"\s*:/.test(pkg);
  const ui = frameworks.some((f) => UI_FRAMEWORKS.has(f));
  return { config, dependency, ui };
}

export function survey(root) {
  const entries = projectEntries(root);
  const agentsMd = agentsMdState(root);
  const mode = entries.length === 0 ? 'new' : agentsMd === 'filled' ? 'onboarded' : 'existing';
  const dirs = findManifestDirs(root, 3); // skips dot-directories, so .agents/ never counts
  const roots = projectRoots(dirs);
  const frameworks = detectFrameworks(dirs).ids;
  const stacks = [...new Set(roots.flatMap((r) => r.stacks))];
  const nodeRoot = roots.find((r) => r.stacks.includes('node'));
  const pm = nodeRoot ? detectPackageManager(nodeRoot.dir, root).pm : null;
  const g = gitStatus(root);
  const commits = g.repo ? Number(git(root, ['rev-list', '--count', 'HEAD']) || 0) : 0;
  const remotes = g.repo ? (git(root, ['remote']) || '').split(/\r?\n/).filter(Boolean) : [];
  const e2e = e2eState(root, frameworks);
  const lessons = seedLessons(root);
  const next = mode === 'new'
    ? 'ask what to build, then /new-project in place (this folder is the target; keep .agents/)'
    : mode === 'existing'
      ? '/onboard-repo from step 2 (.agents/ is already here): map, activate packs, write AGENTS.md'
      : 'refresh: compare repo-map.mjs with AGENTS.md, re-run activate-stack, doctor and verify; fix only drift';
  return {
    root: toPosix(root), mode, entries, agentsMd, stacks, packageManager: pm, frameworks,
    git: { repo: g.repo, commits, remotes, identity: g.identity, hook: g.hook },
    e2e, machineLessons: lessons, next,
  };
}

function text(s) {
  const who = s.git.identity ? `${s.git.identity.name} <${s.git.identity.email}>` : 'NOT CONFIGURED (the user must set it)';
  const shown = s.entries.slice(0, 10).join(', ') + (s.entries.length > 10 ? `, ... (+${s.entries.length - 10})` : '');
  return [
    'START-DETECT',
    `mode: ${s.mode}`,
    `root: ${s.root}`,
    `project entries: ${s.entries.length}${s.entries.length ? ` (${shown})` : ''}`,
    `stacks: ${s.stacks.join(', ') || 'none'}; package manager: ${s.packageManager || 'none'}; frameworks: ${s.frameworks.join(', ') || 'none'}`,
    `AGENTS.md: ${s.agentsMd}`,
    `git: ${s.git.repo ? `repository, ${s.git.commits} commit(s), remotes: ${s.git.remotes.join(', ') || 'none'}` : 'not a repository'}`,
    `git identity: ${who}`,
    `commit-msg hook: ${s.git.hook}`,
    `e2e: playwright config ${s.e2e.config || 'absent'}; @playwright/test ${s.e2e.dependency ? 'present' : 'absent'}; UI framework ${s.e2e.ui ? 'detected' : 'not detected'}`,
    `machine lessons to confirm: ${s.machineLessons.map((l) => `${l.id} (${l.text.slice(0, 60)})`).join('; ') || 'none'}`,
    `next: ${s.next}`,
  ].join('\n');
}

function main(argv) {
  let root = DEFAULT_ROOT;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { process.stdout.write(`${USAGE}\n`); return 0; }
    if (a === '--json') json = true;
    else if (a === '--root' && argv[i + 1]) root = path.resolve(argv[++i]);
    else { process.stderr.write(`detect: unknown argument ${a} (see --help)\n`); return 2; }
  }
  if (!fs.existsSync(root)) { process.stderr.write(`detect: no such directory: ${root}\n`); return 2; }
  const s = survey(root);
  process.stdout.write(json ? `${JSON.stringify(s, null, 2)}\n` : `${text(s)}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { process.stderr.write(`detect: ${e.message}\n`); process.exitCode = 2; }
}
