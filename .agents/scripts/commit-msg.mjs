#!/usr/bin/env node
// Commit policy for the Frontier Kit (.agents/rules/topic-git-workflow.md): Conventional Commits headers, no
// co-author or AI-attribution trailers, and commits made only as the user's own configured git identity.
// Runs as a git commit-msg hook (`install`) or on demand (`check`). Zero dependencies, Node >= 18.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
export const HOOK_MARKER = '# frontier-kit commit-msg hook';

const USAGE = `Usage: node .agents/scripts/commit-msg.mjs <command> [options]

Commands:
  check <file>              Check a commit message file (what git passes to a commit-msg hook). Inside a git
                            repo it also checks that the commit author and committer are your configured identity.
  check --message "<text>"  Check a message given inline (message rules only).
  install [--dry-run]       Install the commit-msg hook in this repo's .git/hooks. Never overwrites a hook that
                            is not the kit's; with core.hooksPath (husky, lefthook) it prints the line to add.
  status                    Show whether the hook is installed and which git identity commits will use.

Options:
  --root <dir>   repository root (default: two levels above this script)
  --json         machine-readable output (check, status)
  -h, --help     show this help

Rules: header "<type>(<scope>)!: <description>" with type in ${'{'}feat, fix, docs, style, refactor, perf, test, build,
ci, chore, revert${'}'}, at most 100 characters (72 recommended); a blank line after the header; no Co-authored-by
trailers, AI-attribution lines or robot emoji; Signed-off-by only with your own identity. Merge, revert and
fixup!/squash!/amend! messages are accepted as git writes them.
Set FRONTIER_COMMIT_IDENTITY=off to skip the identity check for one command.
Exit codes: 0 pass, 1 policy violation (or install refused), 2 usage or internal error.
`;

export const TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
const HEADER_RE = new RegExp(`^(${TYPES.join('|')})(\\([^()\\s][^()]*\\))?(!)?: (\\S.*)$`);
const GIT_GENERATED = /^(Merge (branch|pull request|remote-tracking branch|tag|commit) |Merge [0-9a-f]{7,} into |Revert ".*"$|(fixup|squash|amend)! )/;
const COAUTHOR = /^\s*co-?authored-?by\s*:/i;
const SIGNOFF = /^\s*signed-off-by\s*:\s*(.*)$/i;
// Checked on body and footer lines only (never the header), so a feature description like "feat: add AI-assisted
// search" is fine. Prose lines match only when they START with the attribution phrase, as tools write it.
const ATTRIBUTION = [
  [/^\s*(assisted|generated|created|written|authored|made|produced)-(by|with)\s*:/i, 'AI or tool attribution trailer'],
  [/^[\W_]*(generated|created|written|authored|made|produced|assisted|co-?written)\s+(with|by|using|in)\s+\[?(an?\s+)?(ai\b|claude|gemini|antigravity|chatgpt|gpt-?\d|openai|copilot|cursor|codex|llm)/i, 'AI attribution line'],
  [/^[\W_]*(this\s+(commit|change|pr)\s+(was|is)\s+)?ai[- ](generated|assisted|authored)\W*$/i, 'AI attribution line'],
  [/noreply@(anthropic\.com|google\.com|openai\.com)/i, 'AI vendor noreply address'],
  [/\u{1F916}/u, 'robot emoji attribution'],
];

// Git's own message cleanup: drop everything after the scissors line, then comment lines.
export function cleanMessage(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (const line of lines) {
    if (/^# -+ >8 -+$/.test(line)) break;
    if (line.startsWith('#')) continue;
    out.push(line.replace(/\s+$/, ''));
  }
  while (out.length && out[0] === '') out.shift();
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

const sameIdent = (a, b) => !!a && !!b && a.name.trim() === b.name.trim() && a.email.trim().toLowerCase() === b.email.trim().toLowerCase();
const fmtIdent = (i) => (i ? `${i.name} <${i.email}>` : '(none)');

/** Check message text. identity = { name, email } of the configured user (enables the Signed-off-by check). */
export function checkMessage(text, { identity = null } = {}) {
  const errors = [];
  const warnings = [];
  const lines = cleanMessage(text);
  if (!lines.length) return { ok: false, errors: ['empty commit message'], warnings, header: '' };
  const header = lines[0];
  if (!GIT_GENERATED.test(header)) {
    const m = HEADER_RE.exec(header);
    if (!m) {
      errors.push(`header is not Conventional Commits: "${header}". Use "<type>(<scope>): <description>" with type one of ${TYPES.join(', ')}`);
    } else if (/\.$/.test(m[4])) {
      warnings.push('description ends with a period');
    }
    if (header.length > 100) errors.push(`header is ${header.length} characters (max 100)`);
    else if (header.length > 72) warnings.push(`header is ${header.length} characters (72 recommended)`);
    if (lines.length > 1 && lines[1] !== '') errors.push('line 2 must be blank (separates the header from the body)');
  }
  lines.forEach((line, i) => {
    const n = i + 1;
    if (COAUTHOR.test(line)) errors.push(`line ${n}: Co-authored-by trailers are not allowed (commit as yourself only)`);
    const so = SIGNOFF.exec(line);
    if (so) {
      const m = /^(.*?)\s*<([^>]+)>\s*$/.exec(so[1]);
      const who = m ? { name: m[1], email: m[2] } : null;
      if (!identity || !sameIdent(who, identity)) {
        errors.push(`line ${n}: Signed-off-by must be your own git identity (${fmtIdent(identity)}), found "${so[1].trim()}"`);
      }
    }
    if (i === 0) return;
    for (const [re, label] of ATTRIBUTION) {
      if (re.test(line)) {
        errors.push(`line ${n}: ${label} is not allowed: "${line.trim()}"`);
        break;
      }
    }
  });
  return { ok: errors.length === 0, errors, warnings, header };
}

// ---------------------------------------------------------------- git helpers
function git(root, args, env = process.env) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', env, windowsHide: true });
  if (r.error) return { ok: false, out: '', err: String(r.error.message || r.error) };
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function parseIdent(s) {
  const m = /^(.*?)\s*<([^>]*)>/.exec(s || '');
  return m ? { name: m[1], email: m[2] } : null;
}

/** The identity from git config only: env overrides and -c parameters are ignored. */
export function configuredIdentity(root) {
  const env = { ...process.env };
  for (const k of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT']) delete env[k];
  const name = git(root, ['config', 'user.name'], env);
  const email = git(root, ['config', 'user.email'], env);
  if (!name.ok || !email.ok || !name.out || !email.out) return null;
  return { name: name.out, email: email.out };
}

/** Compare the ident git will record (env, --author, -c) with the configured identity. */
export function checkIdentity(root) {
  const errors = [];
  if (String(process.env.FRONTIER_COMMIT_IDENTITY || '').toLowerCase() === 'off') return { errors, identity: null };
  const identity = configuredIdentity(root);
  if (!identity) {
    errors.push('git user.name / user.email are not configured. Set them yourself: git config --global user.name "<your name>" and git config --global user.email "<your GitHub email>"');
    return { errors, identity };
  }
  const params = process.env.GIT_CONFIG_PARAMETERS || '';
  if (/user\.(name|email)/i.test(params)) errors.push('the commit overrides user.name/user.email with -c; commit with your configured identity');
  for (const [v, label] of [['GIT_AUTHOR_IDENT', 'author'], ['GIT_COMMITTER_IDENT', 'committer']]) {
    const r = git(root, ['var', v]);
    const who = r.ok ? parseIdent(r.out) : null;
    if (who && !sameIdent(who, identity)) {
      errors.push(`${label} is "${fmtIdent(who)}" but your git identity is "${fmtIdent(identity)}" (no --author, GIT_${label.toUpperCase()}_* or -c user.* overrides)`);
    }
  }
  return { errors, identity };
}

function hooksDir(root) {
  const r = git(root, ['rev-parse', '--git-path', 'hooks']);
  if (!r.ok) return null;
  return path.resolve(root, r.out);
}

function hookScript() {
  return [
    '#!/bin/sh',
    `${HOOK_MARKER} (installed by: node .agents/scripts/commit-msg.mjs install)`,
    '# Conventional Commits, no co-author or AI-attribution trailers, your own git identity only.',
    'root="$(git rev-parse --show-toplevel)" || exit 1',
    'script="$root/.agents/scripts/commit-msg.mjs"',
    '[ -f "$script" ] || exit 0',
    'exec node "$script" check "$1"',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------- commands
function parseArgs(argv) {
  const o = { cmd: null, file: null, message: null, root: null, json: false, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--json') o.json = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--root') o.root = value();
    else if (a === '--message' || a === '-m') o.message = value();
    else if (a.startsWith('-')) throw new Error(`unknown option: ${a}`);
    else if (!o.cmd) o.cmd = a;
    else if (!o.file) o.file = a;
    else throw new Error(`unexpected argument: ${a}`);
  }
  return o;
}

function inGitRepo(root) {
  const r = git(root, ['rev-parse', '--is-inside-work-tree']);
  return r.ok && r.out === 'true';
}

function cmdCheck(o, root) {
  let text;
  if (o.message !== null) text = o.message;
  else if (o.file) text = fs.readFileSync(path.resolve(o.file), 'utf8');
  else throw new Error('check needs <file> or --message "<text>"');
  const repo = o.message === null && inGitRepo(root);
  const ident = repo ? checkIdentity(root) : { errors: [], identity: configuredIdentity(root) };
  const res = checkMessage(text, { identity: ident.identity });
  const errors = [...res.errors, ...ident.errors];
  const ok = errors.length === 0;
  if (o.json) process.stdout.write(`${JSON.stringify({ ok, header: res.header, errors, warnings: res.warnings })}\n`);
  else {
    for (const e of errors) process.stderr.write(`  ERROR ${e}\n`);
    for (const w of res.warnings) process.stderr.write(`  WARN  ${w}\n`);
    process.stderr.write(`COMMIT-MSG: ${ok ? 'PASS' : 'FAIL'}${ok ? '' : ' (commit aborted; fix the message and commit again)'}\n`);
  }
  return ok ? 0 : 1;
}

function cmdInstall(o, root) {
  if (!inGitRepo(root)) {
    process.stderr.write(`commit-msg: ${root} is not a git repository (run git init first)\n`);
    return 1;
  }
  const custom = git(root, ['config', '--get', 'core.hooksPath']);
  const line = 'node .agents/scripts/commit-msg.mjs check "$1"';
  if (custom.ok && custom.out) {
    process.stdout.write(`core.hooksPath is set (${custom.out}): hooks are managed by another tool (husky, lefthook, ...).\n`
      + `Add this line to its commit-msg hook instead:\n  ${line}\nINSTALL: SKIPPED\n`);
    return 1;
  }
  const dir = hooksDir(root);
  if (!dir) {
    process.stderr.write('commit-msg: could not resolve the git hooks directory\n');
    return 2;
  }
  const file = path.join(dir, 'commit-msg');
  const script = hookScript();
  let existing = null;
  try { existing = fs.readFileSync(file, 'utf8'); } catch { /* none */ }
  if (existing !== null && !existing.includes(HOOK_MARKER)) {
    process.stdout.write(`A commit-msg hook already exists and is not the kit's: ${file}\nAdd this line to it:\n  ${line}\nINSTALL: SKIPPED\n`);
    return 1;
  }
  if (existing === script) {
    process.stdout.write(`commit-msg hook already installed: ${file}\nINSTALL: OK (unchanged)\n`);
    return 0;
  }
  if (o.dryRun) {
    process.stdout.write(`would ${existing === null ? 'create' : 'update'} ${file}\nINSTALL: DRY RUN\n`);
    return 0;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, script, { mode: 0o755 });
  try { fs.chmodSync(file, 0o755); } catch { /* Windows: git runs it through sh anyway */ }
  process.stdout.write(`${existing === null ? 'created' : 'updated'} ${file}\nINSTALL: OK\n`);
  return 0;
}

/** { repo, hook, identity }: hook is "installed", "not installed", or a short explanation. */
export function gitStatus(root) {
  const repo = inGitRepo(root);
  const identity = configuredIdentity(root);
  let hook = 'not a git repository';
  if (repo) {
    const custom = git(root, ['config', '--get', 'core.hooksPath']);
    const dir = hooksDir(root);
    let text = null;
    try { text = dir ? fs.readFileSync(path.join(dir, 'commit-msg'), 'utf8') : null; } catch { /* none */ }
    if (text && text.includes(HOOK_MARKER)) hook = 'installed';
    else if (text && text.includes('commit-msg.mjs')) hook = 'called from an existing hook';
    else if (custom.ok && custom.out) hook = `not installed (core.hooksPath = ${custom.out})`;
    else hook = text ? 'another commit-msg hook is installed' : 'not installed';
  }
  return { repo, hook, identity };
}

function cmdStatus(o, root) {
  const { repo, hook, identity } = gitStatus(root);
  if (o.json) process.stdout.write(`${JSON.stringify({ repo, hook, identity })}\n`);
  else process.stdout.write(`git repository: ${repo ? 'yes' : 'no'}\ncommit-msg hook: ${hook}\nidentity: ${identity ? fmtIdent(identity) : 'NOT CONFIGURED (the user must set git user.name / user.email)'}\n`);
  return 0;
}

function main(argv) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`commit-msg: ${e.message}\n`);
    return 2;
  }
  if (o.help || !o.cmd) {
    process.stdout.write(USAGE);
    return o.help ? 0 : 2;
  }
  const root = path.resolve(o.root || DEFAULT_ROOT);
  try {
    if (o.cmd === 'check') return cmdCheck(o, root);
    if (o.cmd === 'install') return cmdInstall(o, root);
    if (o.cmd === 'status') return cmdStatus(o, root);
    process.stderr.write(`commit-msg: unknown command "${o.cmd}" (see --help)\n`);
    return 2;
  } catch (e) {
    process.stderr.write(`commit-msg: ${e.message}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
