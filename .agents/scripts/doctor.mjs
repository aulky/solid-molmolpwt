#!/usr/bin/env node
// Frontier Kit doctor: validates the Antigravity workspace kit under .agents/ (.agents/docs/architecture.md, .agents/docs/antigravity-spec.md).
// Zero dependencies. Exit 0 = no errors, 1 = errors found, 2 = usage/internal error.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, splitFrontmatter } from './lib/frontmatter.mjs';
import { parseLedger } from './lessons.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..', '..');

export const CAPS = {
  alwaysOnRule: 7000, lessonsRule: 4500, scopedRule: 6000, anyRule: 24000,
  guide: 24000, guideSoft: 23000, alwaysOnFile: 3500,
  budgetWarnTokens: 9000, budgetErrorTokens: 16000,
  skillLines: 500, kitSkillLines: 250, ruleDescription: 200, skillDescription: 1024, hookTimeout: 60,
};
export const TRIGGERS = ['always_on', 'glob', 'model_decision', 'manual'];
export const KNOWN_TOOLS = [
  'view_file', 'write_to_file', 'replace_file_content', 'multi_replace_file_content', 'run_command', 'grep_search',
  'find_by_name', 'list_dir', 'search_web', 'read_url_content', 'invoke_subagent', 'send_message', 'manage_subagents',
  'define_subagent', 'manage_task', 'ask_question', 'call_mcp_tool', 'list_resources', 'read_resource',
  'generate_image', 'schedule',
];
// Listed by the binary/docs but not verified as subagent tools, or verified as unavailable in the CLI.
export const CLI_UNAVAILABLE_TOOLS = ['multi_replace_file_content'];
export const UNVERIFIED_TOOLS = ['command_status', 'send_command_input', 'list_permissions', 'ask_permission', 'code_search'];
// .agents/docs/architecture.md: the third-party skills this kit keeps (skills-lock.json entries are added at run time).
export const THIRD_PARTY_SKILLS = [
  'architecture-decision-records', 'commit-archaeologist', 'seo-audit', 'thinking-out-loud', 'vercel-react-best-practices',
];
export const ALLOWED_DIRECTORY_RULES = ['AGENTS.md', 'GEMINI.md', '.agents/GEMINI.md', '.agents/skills/vercel-react-best-practices/AGENTS.md'];
export const IGNORE_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', '.output', '.next', '.nuxt', '.svelte-kit', '.vinxi', 'target',
  'vendor', '.venv', 'venv', '__pycache__', 'coverage', '.turbo', '.cache', '.gradle', 'bin', 'obj', '.dart_tool', '.scratch',
]);
const IGNORE_REL = new Set(['.agents/.state']);
const BUILTIN_COMMANDS = ['plan', 'learn', 'rewind', 'fork', 'browser', 'model', 'agents', 'skills', 'hooks', 'help', 'config', 'usage', 'permissions', 'effort'];
const BUILTIN_AGENTS = ['self', 'research', 'browser'];
const MODELS = ['flash', 'pro', 'inherit'];
const POLICIES = ['off', 'auto', 'eager', 'sandbox'];
const AGENT_BOOL_KEYS = ['subagent', 'mainAgent', 'hidden', 'inheritMcp', 'inheritCustomizations', 'excludeDefaultComponents'];
const TOOL_EVENTS = ['PreToolUse', 'PostToolUse'];
const FLAT_EVENTS = ['PreInvocation', 'PostInvocation', 'Stop'];
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCRIPT_EXT_RE = /\.(mjs|cjs|js|ts|mts|py|sh|bash|ps1|cmd|bat|rb|pl)$/i;
const MAX_WALK = 200000;

const USAGE = `Usage: node .agents/scripts/doctor.mjs [--json] [--quiet] [--root <repoDir>]

Validates the Antigravity kit in <repo>/.agents/: rule frontmatter (trigger, description, globs as ONE quoted
comma string of basename-only "**/<name-glob>" patterns), flat rules/ folder, size caps, always-on token budget,
skills, subagents, the orchestrator-mode roster (workers never list invoke_subagent, carry the "You are a WORKER"
role line and map to a phase in hooks/lib.mjs TYPE_PHASE; the orchestrator has no write tools and its guard hook
covers invoke_subagent + the write tools), hooks.json, stray AGENTS.md/GEMINI.md, links to guides, and the lessons ledger.

  --json     print a JSON report
  --quiet    print only problems and the summary line
  --root     repository root (default: two levels above this script)
  --help     show this help

Exit codes: 0 no errors (warnings allowed), 1 errors found, 2 usage or internal error.`;

// ---------------------------------------------------------------------------------------------
function makeCtx(root) {
  const kit = path.join(root, '.agents');
  const issues = [];
  const cache = new Map();
  const ctx = {
    root, kit, issues,
    counts: {
      rules: 0, rulesByTrigger: { always_on: 0, glob: 0, model_decision: 0, manual: 0, invalid: 0 }, ruleSupportFiles: 0,
      guides: 0, skills: 0, kitSkills: 0, thirdPartySkills: 0, draftSkills: 0, agents: 0,
      hooks: 0, hookHandlers: 0, lessonsActive: 0, lessonsRetired: 0,
    },
    rules: [],
    agentInfos: [],
    skillIndexBytes: 0,
    budget: null,
    rel: (p) => path.relative(root, p).split(path.sep).join('/') || '.',
    read(p) {
      if (cache.has(p)) return cache.get(p);
      let t = null;
      try { t = fs.readFileSync(p, 'utf8'); } catch { t = null; }
      cache.set(p, t);
      return t;
    },
    add(level, code, file, message, line) {
      issues.push({ level, code, file, ...(line ? { line } : {}), message });
    },
  };
  ctx.error = (code, file, message, line) => ctx.add('error', code, file, message, line);
  ctx.warn = (code, file, message, line) => ctx.add('warn', code, file, message, line);
  return ctx;
}

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const exists = (p) => { try { fs.statSync(p); return true; } catch { return false; } };
const bytesOf = (s) => Buffer.byteLength(s ?? '', 'utf8');
const lineCount = (s) => (s ? (s.match(/\n/g) ?? []).length + (s.endsWith('\n') ? 0 : 1) : 0);
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function readdirSorted(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); } catch { return []; }
}

function lineAt(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/** Replace fenced code blocks and inline code spans with spaces (same length, newlines kept). */
export function maskCode(text) {
  const lines = String(text ?? '').split('\n');
  let fence = null;
  return lines.map((line) => {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      return ' '.repeat(line.length);
    }
    if (m) { fence = m[1]; return ' '.repeat(line.length); }
    return line.replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (s) => ' '.repeat(s.length));
  }).join('\n');
}

/** Markdown links [text](target) and reference definitions, outside code. Includes @[..](..) are skipped. */
export function extractLinks(text) {
  const masked = maskCode(text);
  const out = [];
  const re = /(?<![@\\])\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;
  for (const m of masked.matchAll(re)) out.push({ target: m[1], line: lineAt(masked, m.index) });
  for (const m of masked.matchAll(/^\s{0,3}\[[^\]\n]+\]:\s*(\S+)/gm)) out.push({ target: m[1], line: lineAt(masked, m.index) });
  return out;
}

function localTarget(t) {
  let s = String(t).trim().replace(/^<|>$/g, '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; // http:, mailto:, file:, C:
  if (s.startsWith('#') || s.startsWith('/') || s.startsWith('\\') || s.startsWith('~')) return null;
  if (/[<>{}$*]/.test(s)) return null;
  s = s.split('#')[0].split('?')[0];
  if (!s) return null;
  try { s = decodeURIComponent(s); } catch { /* keep raw */ }
  return s;
}

function checkLinks(ctx, file, text, severity, codeName = 'link-broken') {
  const r = ctx.rel(file);
  const seen = new Set();
  for (const { target, line } of extractLinks(text)) {
    const t = localTarget(target);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    const abs = path.resolve(path.dirname(file), t);
    if (exists(abs)) continue;
    const intoGuides = abs.startsWith(path.join(ctx.kit, 'guides') + path.sep);
    const level = typeof severity === 'function' ? severity(intoGuides) : severity;
    ctx.add(level, codeName, r, `broken relative link "${target}" (resolves to ${ctx.rel(abs)}, which does not exist)`, line);
  }
}

const REF_RE = /(?<![\w.-])\.agents\/(?:hooks\.json|GEMINI\.md|README\.md|(?:guides|scripts|skills|agents|docs|hooks|memory|rules)(?:\/[^\s`'"()<>[\]{}*,;|!?]*)?)(?![\w-]|\.\w)/g;

/** Repo-relative ".agents/..." path references in prose/code (placeholders like <id> are skipped). */
export function extractKitRefs(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(REF_RE)) {
    const next = text[m.index + m[0].length] ?? '';
    if ('<{*$[%'.includes(next) && next !== '') continue;
    let p = m[0].replace(/:\d+(?::\d+)?$/, '').replace(/[.:]+$/, '');
    if (p.includes('...')) continue;
    const parts = p.split('/');
    if (parts[1] === 'rules' && parts.length > 3) continue; // examples of (invalid) nested rule paths
    out.push({ ref: p, line: lineAt(text, m.index) });
  }
  return out;
}

function checkKitRefs(ctx, file, text, isRuleLike) {
  const r = ctx.rel(file);
  const seen = new Set();
  for (const { ref, line } of extractKitRefs(text)) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    if (exists(path.join(ctx.root, ref))) continue;
    const guide = ref.startsWith('.agents/guides/');
    if (guide && isRuleLike) ctx.error('ref-missing', r, `references ${ref}, which does not exist (create the guide or fix the path)`, line);
    else ctx.warn('ref-missing', r, `references ${ref}, which does not exist`, line);
  }
}

/** Expand @[label](path) includes (outside code) like Antigravity does before its size check. */
function expandIncludes(ctx, file, text, depth = 0, stack = []) {
  const missing = [];
  if (depth > 4) return { text, missing };
  const masked = maskCode(text);
  const re = /@\[[^\]\n]*\]\(([^)\s]+)\)/g;
  let out = '';
  let last = 0;
  for (const m of masked.matchAll(re)) {
    const target = m[1];
    const abs = target.startsWith('~/') ? path.join(os.homedir(), target.slice(2)) : path.resolve(path.dirname(file), target);
    const inc = stack.includes(abs) ? null : ctx.read(abs);
    out += text.slice(last, m.index);
    if (inc === null) {
      missing.push({ target, line: lineAt(text, m.index) });
      out += text.slice(m.index, m.index + m[0].length);
    } else {
      const inner = expandIncludes(ctx, abs, splitFrontmatter(inc).body, depth + 1, [...stack, file]);
      out += inner.text;
    }
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  return { text: out, missing };
}

/** Plain (unquoted) scalars that strict YAML parsers reject: "key: a: b" or "key: a #b". */
function strictYamlHazards(fm) {
  const hazards = [];
  const yamlLines = fm.yaml.split(/\r?\n/);
  for (const [key, info] of Object.entries(fm.styles)) {
    if (info.style !== 'plain' || key.includes('[')) continue;
    const raw = yamlLines[info.line - 2];
    if (raw === undefined) continue;
    const m = /^\s*[^:]+?:\s+(.*)$/.exec(raw);
    if (!m) continue;
    const v = m[1];
    if (/:\s/.test(v) || /:$/.test(v)) hazards.push({ key, line: info.line, why: 'contains ": "' });
  }
  return hazards;
}

// ---------------------------------------------------------------------------------------------
// Rules

/** Classify one glob pattern. Returns [{level, code, message}]. */
export function checkGlobPattern(p) {
  const out = [];
  if (p === '') return [{ level: 'warn', code: 'rule-glob-empty', message: 'empty pattern (stray comma) in globs' }];
  if (p.includes('\\')) {
    out.push({ level: 'error', code: 'rule-glob-backslash', message: `pattern "${p}" contains a backslash and never matches; use a basename glob like "**/${p.split(/[\\/]/).pop()}"` });
    return out;
  }
  if (/[{}]/.test(p)) {
    out.push({ level: 'error', code: 'rule-glob-brace', message: `pattern "${p}" uses brace expansion; list each pattern separately ("**/*.ts,**/*.tsx")` });
    return out;
  }
  if (p.startsWith('!')) out.push({ level: 'warn', code: 'rule-glob-negation', message: `negated pattern "${p}" is unverified in Antigravity; remove it` });
  const body = p.replace(/^!/, '');
  const rest = body.startsWith('**/') ? body.slice(3) : body;
  if (rest.includes('/')) {
    const baseName = rest.split('/').pop();
    const hint = baseName && baseName !== '**' && baseName !== '*' ? ` Use "**/${baseName}"` : ' Name the files by basename (e.g. "**/*.sql")';
    out.push({
      level: 'error', code: 'rule-glob-dir',
      message: `pattern "${p}" has a directory component: Antigravity matches globs against the file NAME only (VERIFIED), so it never fires.${hint}, or use model_decision / a directory AGENTS.md for folder scope`,
    });
    return out;
  }
  if (!body.startsWith('**/')) out.push({ level: 'warn', code: 'rule-glob-bare', message: `pattern "${p}" works, but the kit convention is "**/${body}"` });
  if (['*', '**', '*.*'].includes(rest)) out.push({ level: 'warn', code: 'rule-glob-catchall', message: `pattern "${p}" matches every file; narrow it or use trigger: always_on` });
  return out;
}

function splitOutsideBraces(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

function checkGlobs(ctx, r, value, styleInfo) {
  const line = styleInfo?.line;
  const style = styleInfo?.style;
  let patterns;
  if (Array.isArray(value) || style === 'seq' || style === 'flow-seq') {
    ctx.error('rule-globs-list', r, 'globs is a YAML list; Antigravity ignores list globs (VERIFIED). Use ONE quoted comma-separated string: globs: "**/*.py,**/*.go"', line);
    patterns = (Array.isArray(value) ? value : []).filter((v) => typeof v === 'string');
  } else if (typeof value !== 'string') {
    ctx.error('rule-globs-type', r, `globs must be a quoted string like "**/*.ts,**/*.tsx" (got ${value === null ? 'null' : typeof value})`, line);
    return;
  } else {
    if (style === 'plain') ctx.warn('rule-globs-unquoted', r, `globs is unquoted; write it double-quoted: globs: "${value}" (YAML reads a leading * as an alias)`, line);
    else if (style === 'literal' || style === 'folded') ctx.warn('rule-globs-unquoted', r, 'globs is a block scalar; write it as one double-quoted line', line);
    patterns = splitOutsideBraces(value).map((s) => s.trim());
    if (patterns.length > 1 && patterns[patterns.length - 1] === '') patterns.pop();
  }
  for (const p of patterns) for (const res of checkGlobPattern(p)) ctx.add(res.level, res.code, r, res.message, line);
}

function checkRuleFile(ctx, file) {
  const r = ctx.rel(file);
  const name = path.basename(file);
  const text = ctx.read(file) ?? '';
  ctx.counts.rules++;
  const fm = parseFrontmatter(text);
  const record = { file: r, abs: file, name, trigger: null, bytes: bytesOf(text), description: '' };
  ctx.rules.push(record);
  if (!fm.hasFrontmatter) {
    ctx.error('rule-no-frontmatter', r, 'no YAML frontmatter: Antigravity silently ignores this rule. Start the file with ---, trigger: <always_on|glob|model_decision|manual>, description: "...", ---', 1);
    ctx.counts.rulesByTrigger.invalid++;
    return;
  }
  if (!fm.closed) ctx.error('rule-frontmatter-unclosed', r, 'frontmatter is opened with --- but never closed', 1);
  for (const e of fm.errors) if (fm.closed || !/never closed/.test(e.message)) ctx.error('rule-yaml', r, `frontmatter: ${e.message}`, e.line);
  for (const d of fm.duplicates) ctx.error('rule-yaml', r, `duplicate key "${d.key}" (strict YAML parsers reject the whole frontmatter)`, d.line);
  for (const h of strictYamlHazards(fm)) ctx.warn('yaml-strict', r, `unquoted "${h.key}" value ${h.why}; strict YAML parsers reject it - wrap the value in double quotes`, h.line);
  const d = fm.data;
  const tLine = fm.styles.trigger?.line;
  const trigger = d.trigger;
  if (trigger === undefined || trigger === null || trigger === '') {
    ctx.error('rule-trigger-missing', r, 'missing "trigger:" in frontmatter: the rule is silently ignored. Use always_on | glob | model_decision | manual', 2);
  } else if (typeof trigger !== 'string' || !TRIGGERS.includes(trigger)) {
    const norm = String(trigger).toLowerCase().replace(/[^a-z]/g, '');
    const guess = TRIGGERS.find((t) => t.replace(/_/g, '') === norm);
    ctx.error('rule-trigger-invalid', r, `trigger "${trigger}" is not valid (use exactly always_on | glob | model_decision | manual)${guess ? `; did you mean ${guess}?` : ''}`, tLine);
  } else {
    record.trigger = trigger;
  }
  if (record.trigger) ctx.counts.rulesByTrigger[record.trigger]++;
  else ctx.counts.rulesByTrigger.invalid++;

  const desc = d.description;
  if (desc === undefined || desc === null || (typeof desc === 'string' && !desc.trim())) {
    ctx.error('rule-description-missing', r, 'missing "description:" (one line, what + when, <= 200 chars); it is the only text shown for model_decision rules and the fallback when a rule is demoted', 2);
  } else if (typeof desc !== 'string') {
    ctx.error('rule-description-missing', r, 'description must be a string', fm.styles.description?.line);
  } else {
    record.description = desc;
    if (desc.length > CAPS.ruleDescription) ctx.warn('rule-description-long', r, `description is ${desc.length} chars (> ${CAPS.ruleDescription}); shorten to one line: what + when`, fm.styles.description?.line);
  }

  const gkey = 'globs' in d ? 'globs' : 'glob' in d ? 'glob' : null;
  if (gkey === 'glob') ctx.warn('rule-glob-key', r, 'singular "glob:" key; the kit convention is "globs:"', fm.styles.glob?.line);
  const gval = gkey ? d[gkey] : undefined;
  if (record.trigger === 'glob' && (gval === undefined || gval === null || gval === '')) {
    ctx.error('rule-globs-missing', r, 'trigger: glob without globs: the rule never fires. Add globs: "**/*.<ext>"', tLine);
  }
  if (gkey && gval !== null && gval !== undefined && gval !== '') checkGlobs(ctx, r, gval, fm.styles[gkey]);
  if (gkey && (record.trigger === 'always_on' || record.trigger === 'manual')) {
    ctx.warn('rule-globs-ignored', r, `globs has no effect with trigger: ${record.trigger}`, fm.styles[gkey]?.line);
  }

  if (!fm.body.trim()) ctx.warn('rule-empty-body', r, 'rule has frontmatter but no content');
  if (name.startsWith('fw-') && !/Applies only if/i.test(fm.body)) {
    ctx.warn('rule-fw-guard', r, 'framework pack lacks the guard line "Applies only if <manifest condition>. Otherwise ignore this rule."');
  }

  const exp = expandIncludes(ctx, file, text);
  for (const m of exp.missing) ctx.error('rule-include-missing', r, `include @[..](${m.target}) points to a missing file`, m.line);
  const bytes = bytesOf(exp.text);
  record.bytes = bytes;
  const inc = bytes !== bytesOf(text) ? ' after include expansion' : '';
  let cap = CAPS.anyRule;
  let label = 'any';
  if (name === '90-lessons.md') { cap = CAPS.lessonsRule; label = '90-lessons'; }
  else if (record.trigger === 'always_on') { cap = CAPS.alwaysOnRule; label = 'always_on'; }
  else if (record.trigger === 'glob' || record.trigger === 'model_decision') { cap = CAPS.scopedRule; label = record.trigger; }
  if (bytes > CAPS.anyRule) ctx.error('rule-size', r, `${fmt(bytes)} B${inc} > ${fmt(CAPS.anyRule)} B platform cap: Antigravity truncates the rule`);
  else if (bytes > cap) ctx.error('rule-size', r, `${fmt(bytes)} B${inc} > ${fmt(cap)} B kit cap for ${label} rules; move detail into a guide and point to it`);

  checkKitRefs(ctx, file, text, true);
  checkLinks(ctx, file, text, (intoGuides) => (intoGuides ? 'error' : 'warn'));
}

function checkRules(ctx) {
  const dir = path.join(ctx.kit, 'rules');
  if (!isDir(dir)) {
    ctx.warn('rules-missing', '.agents/rules', 'no .agents/rules/ directory');
    return;
  }
  for (const ent of readdirSorted(dir)) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      let n = 0;
      const walkCount = (d) => { for (const e of readdirSorted(d)) { if (e.isDirectory()) walkCount(path.join(d, e.name)); else if (/\.md$/i.test(e.name)) n++; } };
      walkCount(full);
      ctx.error('rule-nested-dir', ctx.rel(full), `nested folder in .agents/rules/ (${n} .md file(s)): Antigravity scans rules/ flat and silently ignores subfolders. Move the files up into .agents/rules/`);
      continue;
    }
    if (!ent.isFile()) continue;
    if (!/\.md$/i.test(ent.name)) { ctx.counts.ruleSupportFiles++; continue; }
    checkRuleFile(ctx, full);
  }
  const lessons = ctx.rules.find((x) => x.name === '90-lessons.md');
  if (lessons && lessons.trigger && lessons.trigger !== 'always_on') {
    ctx.warn('lessons-rule-trigger', lessons.file, `90-lessons.md should be trigger: always_on (is ${lessons.trigger})`);
  }
}

// ---------------------------------------------------------------------------------------------
// Always-on files + budget

function checkAlwaysOnFiles(ctx) {
  const files = [
    { rel: 'AGENTS.md', required: true, what: 'root AGENTS.md (project facts)' },
    { rel: 'GEMINI.md', required: false },
    { rel: '.agents/GEMINI.md', required: true, what: '.agents/GEMINI.md (kit index)' },
    { rel: '.agents/AGENTS.md', required: false },
  ];
  const budgetFiles = [];
  for (const f of files) {
    const abs = path.join(ctx.root, f.rel);
    const text = ctx.read(abs);
    if (text === null) {
      if (f.required) ctx.warn('alwayson-missing', f.rel, `${f.what} is missing`);
      continue;
    }
    if (splitFrontmatter(text).hasFrontmatter) ctx.warn('alwayson-frontmatter', f.rel, 'standalone AGENTS.md/GEMINI.md take no frontmatter; it is injected as plain text', 1);
    const exp = expandIncludes(ctx, abs, text);
    for (const m of exp.missing) ctx.error('rule-include-missing', f.rel, `include @[..](${m.target}) points to a missing file`, m.line);
    const bytes = bytesOf(exp.text);
    if (bytes > CAPS.anyRule) ctx.error('alwayson-size', f.rel, `${fmt(bytes)} B > ${fmt(CAPS.anyRule)} B platform cap (truncated)`);
    else if ((f.rel === 'AGENTS.md' || f.rel === '.agents/GEMINI.md') && bytes > CAPS.alwaysOnFile) {
      ctx.warn('alwayson-size', f.rel, `${fmt(bytes)} B > ${fmt(CAPS.alwaysOnFile)} B kit cap; it is injected every turn - move detail into guides/skills`);
    }
    budgetFiles.push({ file: f.rel, bytes });
    checkKitRefs(ctx, abs, text, true);
    checkLinks(ctx, abs, text, (intoGuides) => (intoGuides ? 'error' : 'warn'));
  }
  return budgetFiles;
}

function checkBudget(ctx, alwaysOnFiles) {
  const files = [...alwaysOnFiles];
  for (const r of ctx.rules) if (r.trigger === 'always_on') files.push({ file: r.file, bytes: r.bytes });
  const bytes = files.reduce((s, f) => s + f.bytes, 0);
  const tokens = Math.ceil(bytes / 4);
  let mdBytes = 0;
  for (const r of ctx.rules) {
    if (r.trigger === 'model_decision') mdBytes += bytesOf(`- file:///${r.abs.split(path.sep).join('/')}: ${r.description}\n`);
  }
  ctx.budget = {
    tokens, bytes, files,
    warnTokens: CAPS.budgetWarnTokens, errorTokens: CAPS.budgetErrorTokens,
    modelDecisionIndexTokens: Math.ceil(mdBytes / 4),
    skillIndexTokens: Math.ceil(ctx.skillIndexBytes / 4),
  };
  const detail = `~${fmt(tokens)} tokens (${fmt(bytes)} B / 4) across ${files.length} always-on file(s)`;
  if (tokens > CAPS.budgetErrorTokens) ctx.error('budget', '.agents/rules', `always-on budget ${detail} > ${fmt(CAPS.budgetErrorTokens)}; Antigravity demotes the largest rules to pointers - trim or convert rules to glob/model_decision`);
  else if (tokens > CAPS.budgetWarnTokens) ctx.warn('budget', '.agents/rules', `always-on budget ${detail} > ${fmt(CAPS.budgetWarnTokens)} target; weak models follow fewer instructions as the always-on layer grows`);
}

// ---------------------------------------------------------------------------------------------
// Guides

function walkFiles(dir, pred, out = [], depth = 0) {
  if (depth > 8) return out;
  for (const e of readdirSorted(dir)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name)) walkFiles(full, pred, out, depth + 1); }
    else if (e.isFile() && pred(e.name)) out.push(full);
  }
  return out;
}

function checkGuides(ctx) {
  const dir = path.join(ctx.kit, 'guides');
  if (!isDir(dir)) return;
  for (const f of walkFiles(dir, (n) => /\.md$/i.test(n))) {
    ctx.counts.guides++;
    const text = ctx.read(f) ?? '';
    const bytes = bytesOf(text);
    if (bytes > CAPS.guide) ctx.error('guide-size', ctx.rel(f), `${fmt(bytes)} B > ${fmt(CAPS.guide)} B cap; split the guide`);
    else if (bytes > CAPS.guideSoft) ctx.warn('guide-size', ctx.rel(f), `${fmt(bytes)} B > ${fmt(CAPS.guideSoft)} B template maximum`);
    if (path.basename(f).toLowerCase() === 'readme.md' && path.dirname(f) === dir) checkLinks(ctx, f, text, 'warn');
  }
}

// ---------------------------------------------------------------------------------------------
// Skills

function thirdPartySkills(ctx) {
  const set = new Set(THIRD_PARTY_SKILLS);
  const lock = ctx.read(path.join(ctx.root, 'skills-lock.json'));
  if (lock) {
    try {
      const j = JSON.parse(lock);
      if (j && j.skills && typeof j.skills === 'object') for (const k of Object.keys(j.skills)) set.add(k);
    } catch { /* ignore a broken lockfile here */ }
  }
  return set;
}

function checkSkills(ctx) {
  const dir = path.join(ctx.kit, 'skills');
  if (!isDir(dir)) return;
  const third = thirdPartySkills(ctx);
  const names = new Map();
  for (const ent of readdirSorted(dir)) {
    const folder = path.join(dir, ent.name);
    if (!ent.isDirectory()) {
      if (ent.isFile() && /\.md$/i.test(ent.name)) ctx.warn('skill-stray-file', ctx.rel(folder), 'files directly in .agents/skills/ are not skills; use .agents/skills/<name>/SKILL.md');
      continue;
    }
    if (ent.name === '_drafts') {
      ctx.counts.draftSkills += readdirSorted(folder).filter((e) => e.isDirectory()).length;
      continue;
    }
    const skillMd = path.join(folder, 'SKILL.md');
    const tp = third.has(ent.name);
    const r = ctx.rel(skillMd);
    if (!isFile(skillMd)) {
      ctx.warn('skill-no-skillmd', ctx.rel(folder), 'folder has no SKILL.md, so it is not loaded as a skill');
      continue;
    }
    ctx.counts.skills++;
    if (tp) ctx.counts.thirdPartySkills++;
    else ctx.counts.kitSkills++;
    const E = tp ? ctx.warn : ctx.error;
    const pre = tp ? '(third-party skill, do not edit; update or reinstall it) ' : '';
    const text = ctx.read(skillMd) ?? '';
    const fm = parseFrontmatter(text);
    if (!fm.hasFrontmatter) { E('skill-no-frontmatter', r, `${pre}SKILL.md has no frontmatter (name, description)`, 1); continue; }
    for (const e of fm.errors) E('skill-yaml', r, `${pre}frontmatter: ${e.message}`, e.line);
    for (const d of fm.duplicates) E('skill-yaml', r, `${pre}duplicate key "${d.key}"`, d.line);
    if (!tp) for (const h of strictYamlHazards(fm)) ctx.warn('yaml-strict', r, `unquoted "${h.key}" value ${h.why}; strict YAML parsers reject it - use a >- block or double quotes`, h.line);
    const { name, description } = fm.data;
    const nLine = fm.styles.name?.line;
    if (typeof name !== 'string' || !name.trim()) E('skill-name-missing', r, `${pre}missing "name:" (must equal the folder name "${ent.name}")`, 2);
    else {
      if (name !== ent.name) E('skill-name-mismatch', r, `${pre}name "${name}" does not match folder "${ent.name}"`, nLine);
      if (!NAME_RE.test(name)) E('skill-name-format', r, `${pre}name "${name}" must be lowercase-hyphen (a-z, 0-9, -)`, nLine);
      if (BUILTIN_COMMANDS.includes(name)) ctx.warn('skill-name-collision', r, `/${name} shadows a built-in slash command; rename the skill`, nLine);
      if (names.has(name)) ctx.error('skill-duplicate-name', r, `skill name "${name}" is also used by ${names.get(name)}`, nLine);
      else names.set(name, r);
    }
    if (typeof description !== 'string' || !description.trim()) E('skill-description-missing', r, `${pre}missing "description:" (third person: what it does + when to use it + trigger words)`, 2);
    else {
      if (description.length > CAPS.skillDescription) ctx.warn('skill-description-long', r, `${pre}description is ${description.length} chars (> ${CAPS.skillDescription})`, fm.styles.description?.line);
      ctx.skillIndexBytes += bytesOf(`${name}: ${description}\n`);
    }
    const lines = lineCount(text);
    if (lines > CAPS.skillLines) E('skill-too-long', r, `${pre}${lines} lines > ${CAPS.skillLines}; move detail into references/`);
    else if (!tp && lines > CAPS.kitSkillLines) ctx.warn('skill-long', r, `${lines} lines > ${CAPS.kitSkillLines} (kit skill target); move bulk into references/`);
    if (!tp && !(fm.data.metadata && typeof fm.data.metadata === 'object' && fm.data.metadata.icon)) {
      ctx.warn('skill-icon-missing', r, 'no metadata.icon (add "metadata:\\n  icon: <one emoji>")');
    }
    checkLinks(ctx, skillMd, text, tp ? 'warn' : 'error', 'skill-broken-link');
    if (!tp) {
      checkKitRefs(ctx, skillMd, text, false);
      for (const f of walkFiles(folder, (n) => /\.md$/i.test(n))) {
        if (f !== skillMd) checkLinks(ctx, f, ctx.read(f) ?? '', 'warn', 'skill-broken-link');
      }
    }
  }
}

function checkWorkflows(ctx) {
  const dir = path.join(ctx.kit, 'workflows');
  if (!isDir(dir)) return;
  const n = readdirSorted(dir).filter((e) => e.isFile() && /\.md$/i.test(e.name)).length;
  if (n) ctx.warn('workflows-deprecated', '.agents/workflows', `${n} workflow file(s): workflows are deprecated (retired 2026-11-01); convert them to skills`);
}

// ---------------------------------------------------------------------------------------------
// Agents

function suggestTool(t) {
  const s = String(t).toLowerCase();
  let best = null;
  let bestD = 4;
  for (const k of KNOWN_TOOLS) {
    const d = editDistance(s, k);
    if (d < bestD) { best = k; bestD = d; }
  }
  return best;
}

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

function checkAgentFile(ctx, file, expectedName, names) {
  const r = ctx.rel(file);
  ctx.counts.agents++;
  const text = ctx.read(file) ?? '';
  const fm = parseFrontmatter(text);
  if (!fm.hasFrontmatter) { ctx.error('agent-no-frontmatter', r, 'agent file has no frontmatter (name, description, model, tools)', 1); return; }
  for (const e of fm.errors) ctx.error('agent-yaml', r, `frontmatter: ${e.message}`, e.line);
  for (const d of fm.duplicates) ctx.error('agent-yaml', r, `duplicate key "${d.key}"`, d.line);
  for (const h of strictYamlHazards(fm)) ctx.warn('yaml-strict', r, `unquoted "${h.key}" value ${h.why}; strict YAML parsers reject it - wrap it in double quotes`, h.line);
  const d = fm.data;
  const st = fm.styles;
  if (typeof d.name !== 'string' || !d.name.trim()) ctx.error('agent-name-missing', r, 'missing "name:" (Antigravity rejects the agent: "missing name or description")', 2);
  else {
    if (d.name !== expectedName) ctx.warn('agent-name-mismatch', r, `name "${d.name}" differs from the file name "${expectedName}" (TypeName uses the name)`, st.name?.line);
    if (!NAME_RE.test(d.name)) ctx.warn('agent-name-format', r, `name "${d.name}" should be lowercase-hyphen`, st.name?.line);
    if (BUILTIN_AGENTS.includes(d.name)) ctx.error('agent-name-builtin', r, `name "${d.name}" collides with a built-in subagent (${BUILTIN_AGENTS.join(', ')})`, st.name?.line);
    if (names.has(d.name)) ctx.error('agent-duplicate-name', r, `agent name "${d.name}" is also used by ${names.get(d.name)}`, st.name?.line);
    else names.set(d.name, r);
  }
  if (typeof d.description !== 'string' || !d.description.trim()) ctx.error('agent-description-missing', r, 'missing "description:" (the orchestrator reads it to pick the worker TypeName)', 2);
  if (d.model !== undefined && !MODELS.includes(d.model)) ctx.error('agent-model-invalid', r, `model "${d.model}" is not one of ${MODELS.join(' | ')}`, st.model?.line);
  if (d.tools !== undefined && d.tools !== null) {
    if (!Array.isArray(d.tools)) {
      ctx.error('agent-tools-type', r, 'tools must be a YAML list (tools:\\n  - view_file\\n  - run_command)', st.tools?.line);
    } else {
      for (const t of d.tools) {
        if (typeof t !== 'string') { ctx.error('agent-tool-unknown', r, `tool entry ${JSON.stringify(t)} is not a tool name`, st.tools?.line); continue; }
        if (CLI_UNAVAILABLE_TOOLS.includes(t)) ctx.warn('agent-tool-cli-unavailable', r, `${t} is silently dropped for subagents in the agy CLI (VERIFIED); use replace_file_content`, st.tools?.line);
        else if (UNVERIFIED_TOOLS.includes(t)) ctx.warn('agent-tool-unverified', r, `${t} exists in the binary but is not verified as a subagent tool`, st.tools?.line);
        else if (!KNOWN_TOOLS.includes(t)) {
          const s = suggestTool(t);
          ctx.error('agent-tool-unknown', r, `unknown tool "${t}"${s ? ` (did you mean ${s}?)` : ''}; a misspelled tool can hang the subagent`, st.tools?.line);
        }
      }
    }
  }
  for (const k of AGENT_BOOL_KEYS) {
    if (d[k] !== undefined && typeof d[k] !== 'boolean') ctx.warn('agent-bool', r, `${k} should be true or false (got ${JSON.stringify(d[k])})`, st[k]?.line);
  }
  if (d.commandExecutionPolicy !== undefined && !POLICIES.includes(d.commandExecutionPolicy)) {
    ctx.error('agent-policy-invalid', r, `commandExecutionPolicy "${d.commandExecutionPolicy}" is not one of ${POLICIES.join(' | ')}`, st.commandExecutionPolicy?.line);
  }
  ctx.agentInfos.push({ r, base: expectedName, name: typeof d.name === 'string' ? d.name.trim() : '', data: d, styles: st, body: fm.body });
  if (!/^#\s+\S/m.test(maskCode(fm.body))) ctx.warn('agent-no-h1', r, 'body has no H1 section (# Role, # Procedure, # Output format, # Rules)');
  if (d.subagent !== false && !/send_message/.test(fm.body)) {
    ctx.warn('agent-no-send-message', r, 'body never mentions send_message; end with "Send your final result with send_message to the caller"');
  }
  checkKitRefs(ctx, file, text, false);
}

function checkAgents(ctx) {
  const dir = path.join(ctx.kit, 'agents');
  if (!isDir(dir)) return;
  const names = new Map();
  for (const ent of readdirSorted(dir)) {
    const full = path.join(dir, ent.name);
    if (ent.isFile() && /\.md$/i.test(ent.name)) checkAgentFile(ctx, full, ent.name.replace(/\.md$/i, ''), names);
    else if (ent.isDirectory()) {
      const inner = path.join(full, 'agent.md');
      if (isFile(inner)) checkAgentFile(ctx, inner, ent.name, names);
      else ctx.warn('agent-stray', ctx.rel(full), 'folder without agent.md is not an agent');
    } else if (ent.isFile()) ctx.warn('agent-stray', ctx.rel(full), 'non-.md file in .agents/agents/ is ignored');
  }
}

// ---------------------------------------------------------------------------------------------
// Hooks

function splitCommand(cmd) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const m of cmd.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function checkHandler(ctx, r, where, h) {
  if (!h || typeof h !== 'object' || Array.isArray(h)) { ctx.error('hooks-handler', r, `${where}: handler must be an object { "type": "command", "command": "...", "timeout": N }`); return; }
  ctx.counts.hookHandlers++;
  if (h.type !== undefined && h.type !== 'command') ctx.error('hooks-handler', r, `${where}: type must be "command" (got ${JSON.stringify(h.type)})`);
  if (typeof h.command !== 'string' || !h.command.trim()) { ctx.error('hooks-handler', r, `${where}: "command" is required`); return; }
  if (h.timeout !== undefined && (typeof h.timeout !== 'number' || !(h.timeout > 0))) ctx.error('hooks-timeout', r, `${where}: timeout must be a positive number of seconds`);
  else if (typeof h.timeout === 'number' && h.timeout > CAPS.hookTimeout) ctx.warn('hooks-timeout', r, `${where}: timeout ${h.timeout}s; hooks block the agent loop - keep it <= ${CAPS.hookTimeout}s`);
  for (const tok of splitCommand(h.command)) {
    if (tok.startsWith('-') || /[%$]/.test(tok) || !SCRIPT_EXT_RE.test(tok)) continue;
    const abs = path.isAbsolute(tok) ? tok : tok.startsWith('~/') ? path.join(os.homedir(), tok.slice(2)) : path.resolve(ctx.kit, tok);
    if (!isFile(abs)) ctx.error('hooks-script-missing', r, `${where}: script "${tok}" not found at ${ctx.rel(abs)} (hook commands run with CWD = .agents/)`);
  }
}

function checkHooks(ctx) {
  const file = path.join(ctx.kit, 'hooks.json');
  const r = ctx.rel(file);
  const text = ctx.read(file);
  if (text === null) { ctx.warn('hooks-missing', r, 'no .agents/hooks.json: the deterministic verify/feedback gates are off'); return; }
  let j;
  try { j = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { ctx.error('hooks-json-invalid', r, `invalid JSON: ${e.message}`); return; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) { ctx.error('hooks-shape', r, 'top level must be an object of named hooks: { "<hook-name>": { "<Event>": [...] } }'); return; }
  for (const [name, def] of Object.entries(j)) {
    if (!def || typeof def !== 'object' || Array.isArray(def)) { ctx.error('hooks-shape', r, `"${name}" must be an object of events (every top-level key is a hook name)`); continue; }
    ctx.counts.hooks++;
    let events = 0;
    for (const [key, val] of Object.entries(def)) {
      const where = `${name}.${key}`;
      if (key === 'enabled') { if (typeof val !== 'boolean') ctx.error('hooks-shape', r, `${where} must be true or false`); continue; }
      if (TOOL_EVENTS.includes(key)) {
        events++;
        if (!Array.isArray(val)) { ctx.error('hooks-shape', r, `${where} must be an array of { "matcher", "hooks": [...] } groups`); continue; }
        val.forEach((g, i) => {
          const w = `${where}[${i}]`;
          if (!g || typeof g !== 'object' || Array.isArray(g)) { ctx.error('hooks-shape', r, `${w} must be an object { "matcher": "...", "hooks": [...] }`); return; }
          if (!('hooks' in g)) {
            ctx.error('hooks-shape', r, `${w}: tool events need the nested form { "matcher": "<regex|*>", "hooks": [ { "type": "command", "command": "..." } ] }`);
            return;
          }
          if (g.matcher === undefined) ctx.warn('hooks-matcher', r, `${w}: no "matcher"; use "*" to match every tool`);
          else if (typeof g.matcher !== 'string') ctx.error('hooks-matcher', r, `${w}: matcher must be a string`);
          else if (g.matcher !== '*' && g.matcher !== '') { try { new RegExp(g.matcher); } catch (e) { ctx.error('hooks-matcher', r, `${w}: matcher is not a valid regex: ${e.message}`); } }
          if (!Array.isArray(g.hooks) || !g.hooks.length) { ctx.error('hooks-shape', r, `${w}.hooks must be a non-empty array of handlers`); return; }
          g.hooks.forEach((h, k) => checkHandler(ctx, r, `${w}.hooks[${k}]`, h));
        });
      } else if (FLAT_EVENTS.includes(key)) {
        events++;
        if (!Array.isArray(val)) { ctx.error('hooks-shape', r, `${where} must be an array of handlers`); continue; }
        val.forEach((h, i) => {
          const w = `${where}[${i}]`;
          if (h && typeof h === 'object' && ('hooks' in h || 'matcher' in h)) {
            ctx.error('hooks-shape', r, `${w}: ${key} takes handlers directly ({ "type": "command", "command": "..." }); the nested matcher/hooks form fails with "command hook must specify 'command'"`);
            return;
          }
          checkHandler(ctx, r, w, h);
        });
      } else {
        ctx.warn('hooks-unknown-key', r, `unknown key "${where}": Antigravity silently drops unknown events (valid: ${[...TOOL_EVENTS, ...FLAT_EVENTS].join(', ')}, enabled)`);
      }
    }
    if (!events) ctx.warn('hooks-empty', r, `hook "${name}" has no events`);
  }
  const hookDir = path.join(ctx.kit, 'hooks');
  for (const ent of readdirSorted(hookDir)) {
    if (!ent.isFile() || !/\.json$/i.test(ent.name)) continue;
    const t = ctx.read(path.join(hookDir, ent.name));
    try { JSON.parse((t ?? '').replace(/^﻿/, '')); } catch (e) { ctx.error('hooks-config-invalid', ctx.rel(path.join(hookDir, ent.name)), `invalid JSON: ${e.message}`); }
  }
}

// ---------------------------------------------------------------------------------------------
// Orchestrator-mode roster (.agents/docs/architecture.md, roles): the rules the hooks assume about .agents/agents/.

export const ORCH_WRITE_TOOLS = ['write_to_file', 'replace_file_content', 'multi_replace_file_content'];
export const GUARD_TOOLS = ['invoke_subagent', ...ORCH_WRITE_TOOLS];
const WORKER_LINE_RE = /^You are a WORKER\b(?:\s*\(\s*([A-Za-z]+))?/m;
const GUARD_SCRIPT_RE = /(?:^|[\\/\s"'])orchestrator-guard\.mjs(?=$|[\s"'])/;
// Agents the orchestrator guard never counts as workers (hooks/orchestrator-guard.mjs NEVER).
const NON_WORKERS = new Set([...BUILTIN_AGENTS, 'orchestrator']);

/** Body of the object literal opening at text[open] === '{', with comments blanked; null when unterminated. */
function objectBody(text, open) {
  let out = '';
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (c === '/' && n === '/') { const e = text.indexOf('\n', i); i = e < 0 ? text.length : e - 1; out += ' '; continue; }
    if (c === '/' && n === '*') { const e = text.indexOf('*/', i + 2); if (e < 0) return null; i = e + 1; out += ' '; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      if (j >= text.length) return null;
      out += text.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === '{' && ++depth === 1) continue;
    if (c === '}' && --depth === 0) return out;
    out += c;
  }
  return null;
}

/** `const TYPE_PHASE = { ... }` in hooks/lib.mjs as { TypeName: PHASE } (PHASE '' when not a string literal), or null. */
export function parseTypePhaseMap(text) {
  const src = String(text ?? '');
  const m = /\bconst\s+TYPE_PHASE\s*=\s*\{/.exec(src);
  if (!m) return null;
  const body = objectBody(src, m.index + m[0].length - 1);
  if (body === null) return null;
  const map = {};
  const re = /(?:^|,)\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*(?:"([^"]*)"|'([^']*)')?/g;
  for (const k of body.matchAll(re)) map[k[1] ?? k[2] ?? k[3]] = k[4] ?? k[5] ?? '';
  return map;
}

/** TypeName keys of `const TYPE_PHASE = { ... }` in hooks/lib.mjs, or null when the literal is not found. */
export function parseTypePhase(text) {
  const map = parseTypePhaseMap(text);
  return map ? Object.keys(map) : null;
}

/** Does a PreToolUse matcher (regex on the tool name; "*" or "" = every tool) match this tool? */
export function matcherMatches(matcher, tool) {
  if (matcher === undefined || matcher === '*' || matcher === '') return true;
  if (typeof matcher !== 'string') return false;
  try { return new RegExp(`^(?:${matcher})$`).test(tool); } catch { return false; }
}

/** Tools the enabled orchestrator-guard PreToolUse command handlers cover, from a parsed hooks.json. */
export function guardedTools(hooks) {
  const out = new Set();
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return out;
  const isGuard = (h) => (h?.type === undefined || h.type === 'command') && typeof h?.command === 'string' && GUARD_SCRIPT_RE.test(h.command);
  for (const def of Object.values(hooks)) {
    if (!def || typeof def !== 'object' || Array.isArray(def) || def.enabled === false || !Array.isArray(def.PreToolUse)) continue;
    for (const g of def.PreToolUse) {
      if (!g || !Array.isArray(g.hooks) || !g.hooks.some(isGuard)) continue;
      for (const t of GUARD_TOOLS) if (matcherMatches(g.matcher, t)) out.add(t);
    }
  }
  return out;
}

/** TypeName the hooks use for an agent: frontmatter name, else the file name, lowercased (guard workerRoster). */
const typeName = (a) => (a.name || a.base || '').toLowerCase();

function checkRoster(ctx) {
  const agents = ctx.agentInfos;
  // Same rule as the guard's roster: every agent not marked subagent: false, minus the orchestrator and built-ins.
  const workers = agents.filter((a) => a.data.subagent !== false && !NON_WORKERS.has(typeName(a)));
  const orch = agents.find((a) => typeName(a) === 'orchestrator');
  const tl = (a) => a.styles.tools?.line;
  for (const a of workers) {
    if (a.data.subagent !== true) ctx.error('roster-worker-subagent-flag', a.r, `subagent is ${a.data.subagent === undefined ? 'missing' : JSON.stringify(a.data.subagent)}; the hooks treat every agent not marked subagent: false as a worker, so set subagent: true (worker) or subagent: false (main agent)`, a.styles.subagent?.line ?? 2);
    if (a.data.tools === undefined || a.data.tools === null) ctx.error('roster-worker-no-tools', a.r, 'worker has no tools list, so it inherits every tool including invoke_subagent; list its tools explicitly');
    else if (Array.isArray(a.data.tools) && a.data.tools.includes('invoke_subagent')) ctx.error('roster-worker-delegates', a.r, 'worker lists invoke_subagent; workers never delegate (.agents/docs/architecture.md) - remove it', tl(a));
    if (!WORKER_LINE_RE.test(maskCode(a.body))) ctx.error('roster-worker-role', a.r, 'worker body lacks the role line "You are a WORKER (<PHASE> phase). ..." (outside code) under # Role; the hooks and the model use it to tell workers from the orchestrator');
  }
  if (orch) {
    if (orch.data.subagent !== false) ctx.error('roster-orchestrator-subagent', orch.r, 'the orchestrator must be the main agent (subagent: false, mainAgent: true)', orch.styles.subagent?.line);
    if (orch.data.tools === undefined || orch.data.tools === null) ctx.error('roster-orchestrator-writes', orch.r, `orchestrator has no tools list, so it inherits the write tools (${ORCH_WRITE_TOOLS.join(', ')}); list its read/dispatch tools explicitly`);
    else if (Array.isArray(orch.data.tools)) {
      const w = orch.data.tools.filter((t) => ORCH_WRITE_TOOLS.includes(t));
      if (w.length) ctx.error('roster-orchestrator-writes', orch.r, `orchestrator lists write tool(s) ${w.join(', ')}; it never edits files - every change is a worker task`, tl(orch));
    }
  }
  const libFile = path.join(ctx.kit, 'hooks', 'lib.mjs');
  const lib = ctx.read(libFile);
  if (lib !== null && workers.length) {
    const map = parseTypePhaseMap(lib);
    if (!map) ctx.error('roster-typemap-missing', ctx.rel(libFile), 'no "const TYPE_PHASE = { <type>: \"<PHASE>\", ... }" literal found; doctor cannot check that every worker maps to a pipeline phase');
    else {
      const phaseOf = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), String(v).toUpperCase()]));
      for (const a of workers) {
        const t = typeName(a);
        if (!phaseOf.has(t)) { ctx.error('roster-worker-unmapped', a.r, `worker "${t}" is not in TYPE_PHASE (${ctx.rel(libFile)}); its dispatches count as phase OTHER and the pipeline gate never sees them - add it`, a.styles.name?.line); continue; }
        const said = WORKER_LINE_RE.exec(maskCode(a.body))?.[1]?.toUpperCase();
        const want = phaseOf.get(t);
        if (said && want && said !== want) ctx.warn('roster-worker-phase', a.r, `role line says ${said} phase but TYPE_PHASE maps "${t}" to ${want}; make them agree`);
      }
      const names = new Set(agents.map(typeName));
      for (const k of Object.keys(map)) if (!names.has(k.toLowerCase())) ctx.warn('roster-typemap-stale', ctx.rel(libFile), `TYPE_PHASE maps "${k}" but no agent with that name exists in .agents/agents/`);
    }
  }
  if (orch) {
    const r = ctx.rel(path.join(ctx.kit, 'hooks.json'));
    const text = ctx.read(path.join(ctx.kit, 'hooks.json'));
    let j = null;
    try { j = text === null ? null : JSON.parse(text.replace(/^﻿/, '')); } catch { j = null; }
    const covered = guardedTools(j);
    const missing = GUARD_TOOLS.filter((t) => !covered.has(t));
    if (missing.length) ctx.error('roster-guard-missing', r, `no enabled PreToolUse command hook runs hooks/orchestrator-guard.mjs for ${missing.join(', ')}; the orchestrator's no-edit / one-task-per-worker rules are then unenforced`);
  }
}

// ---------------------------------------------------------------------------------------------
// Stray AGENTS.md / GEMINI.md

function checkStrayDirectoryRules(ctx) {
  const third = thirdPartySkills(ctx);
  const allowed = new Set(ALLOWED_DIRECTORY_RULES.map((s) => s.toLowerCase()));
  let seen = 0;
  let truncated = false;
  const walk = (dir, relDir, depth) => {
    if (truncated || depth > 25) return;
    for (const e of readdirSorted(dir)) {
      if (++seen > MAX_WALK) { truncated = true; return; }
      const relP = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name) || IGNORE_REL.has(relP)) continue;
        const m = /^\.agents\/skills\/([^/]+)$/.exec(relP);
        if (m && third.has(m[1])) continue;
        walk(path.join(dir, e.name), relP, depth + 1);
      } else if (e.isFile()) {
        const lower = e.name.toLowerCase();
        if (lower !== 'agents.md' && lower !== 'gemini.md') continue;
        if (allowed.has(relP.toLowerCase())) continue;
        if (relP.startsWith('.agents/')) {
          ctx.error('stray-directory-rule', relP, `${e.name} inside .agents/ becomes a directory rule injected whenever files there are touched; rename it (e.g. README.md)`);
        } else {
          ctx.warn('stray-directory-rule', relP, `${e.name} is a directory rule: injected whenever the agent touches files under ${relDir}/. Keep it only if intentional (the kit uses root AGENTS.md, root GEMINI.md, .agents/GEMINI.md)`);
        }
      }
    }
  };
  walk(ctx.root, '', 0);
  if (truncated) ctx.warn('walk-truncated', '.', `stopped the stray AGENTS.md/GEMINI.md scan after ${fmt(MAX_WALK)} entries`);
}

// ---------------------------------------------------------------------------------------------
// Lessons ledger

function checkLessons(ctx) {
  const file = path.join(ctx.kit, 'memory', 'lessons.md');
  const r = ctx.rel(file);
  const text = ctx.read(file);
  const curatedAbs = path.join(ctx.kit, 'rules', '90-lessons.md');
  if (text === null) {
    if (exists(curatedAbs) || isDir(path.join(ctx.kit, 'memory'))) ctx.warn('lessons-missing', r, 'no lessons ledger; create it with: node .agents/scripts/lessons.mjs add --scope <area> --text "..."');
    return;
  }
  const led = parseLedger(text);
  ctx.counts.lessonsActive = led.lessons.filter((l) => l.status === 'active').length;
  ctx.counts.lessonsRetired = led.lessons.filter((l) => l.status === 'retired').length;
  if (led.sections.active === null) ctx.warn('lessons-format', r, 'no "## Active" section');
  for (const m of led.malformed) ctx.warn('lessons-format', r, `line does not match "- [L-NNNN] scope:<area> | +h -h | YYYY-MM-DD | <lesson> | evidence: <where>"`, m.line);
  for (const d of led.duplicateIds) ctx.error('lessons-duplicate-id', r, `id ${d.id} is used on lines ${d.lines.join(' and ')}`, d.lines[1]);
  const curated = ctx.read(curatedAbs);
  if (curated !== null) {
    const known = new Set(led.lessons.map((l) => l.num));
    const missing = new Set();
    for (const m of curated.matchAll(/\bL-(\d{1,6})\b/g)) if (!known.has(Number(m[1]))) missing.add(`L-${m[1]}`);
    if (missing.size) ctx.warn('lessons-promoted-unknown', ctx.rel(curatedAbs), `references ${[...missing].join(', ')}, not found in ${r}`);
  }
}

// ---------------------------------------------------------------------------------------------

/** Run every check against <root>. Never throws for content problems. */
export function runDoctor({ root = DEFAULT_ROOT } = {}) {
  const ctx = makeCtx(path.resolve(root));
  if (!isDir(ctx.kit)) {
    ctx.error('kit-missing', '.agents', `no .agents/ directory under ${ctx.root}`);
  } else {
    checkRules(ctx);
    const alwaysOn = checkAlwaysOnFiles(ctx);
    checkGuides(ctx);
    checkSkills(ctx);
    checkWorkflows(ctx);
    checkBudget(ctx, alwaysOn);
    checkAgents(ctx);
    checkHooks(ctx);
    checkRoster(ctx);
    checkStrayDirectoryRules(ctx);
    checkLessons(ctx);
  }
  const order = { error: 0, warn: 1 };
  ctx.issues.sort((a, b) => order[a.level] - order[b.level] || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
  const errors = ctx.issues.filter((i) => i.level === 'error').length;
  const warnings = ctx.issues.length - errors;
  return { version: 1, root: ctx.root, ok: errors === 0, errors, warnings, issues: ctx.issues, budget: ctx.budget, counts: ctx.counts };
}

export function formatText(res, { quiet = false } = {}) {
  const out = [];
  if (!quiet) {
    const c = res.counts;
    const t = c.rulesByTrigger;
    out.push(`Frontier Kit doctor: ${res.root}`);
    out.push(`rules: ${c.rules} (always_on ${t.always_on}, glob ${t.glob}, model_decision ${t.model_decision}, manual ${t.manual}${t.invalid ? `, invalid ${t.invalid}` : ''})`);
    if (res.budget) {
      const b = res.budget;
      out.push(`always-on budget: ~${fmt(b.tokens)} tokens (${fmt(b.bytes)} B / 4; warn > ${fmt(b.warnTokens)}, error > ${fmt(b.errorTokens)})`);
      for (const f of b.files) out.push(`  ${fmt(f.bytes).padStart(7)} B  ${f.file}`);
      out.push(`  + model_decision index ~${fmt(b.modelDecisionIndexTokens)} tokens; skill index ~${fmt(b.skillIndexTokens)} tokens (separate customization budget)`);
    }
    out.push(`guides: ${c.guides}; skills: ${c.skills} (kit ${c.kitSkills}, third-party ${c.thirdPartySkills}, drafts ${c.draftSkills}); agents: ${c.agents}; hooks: ${c.hooks} (${c.hookHandlers} handlers); lessons: ${c.lessonsActive} active, ${c.lessonsRetired} retired`);
    out.push('');
  }
  for (const i of res.issues) {
    out.push(`${i.level === 'error' ? 'ERROR' : 'WARN '} ${i.file}${i.line ? `:${i.line}` : ''} [${i.code}] ${i.message}`);
  }
  out.push(`DOCTOR: ${res.ok ? 'PASS' : 'FAIL'} (${res.errors} error${res.errors === 1 ? '' : 's'}, ${res.warnings} warning${res.warnings === 1 ? '' : 's'})`);
  return out.join('\n');
}

export function parseArgs(argv) {
  const opts = { json: false, quiet: false, help: false, root: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--quiet' || a === '-q') opts.quiet = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--root') { opts.root = argv[++i]; if (!opts.root) throw new Error('--root needs a directory'); }
    else if (a.startsWith('--root=')) opts.root = a.slice(7);
    else throw new Error(`unknown argument "${a}"`);
  }
  return opts;
}

function isMain() {
  try {
    const a = path.resolve(fileURLToPath(import.meta.url));
    const b = path.resolve(process.argv[1] ?? '');
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch { return false; }
}

if (isMain()) {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) {
    process.stderr.write(`doctor: ${e.message}\n${USAGE}\n`);
    process.exit(2);
  }
  if (opts.help) { process.stdout.write(USAGE + '\n'); process.exit(0); }
  try {
    const res = runDoctor({ root: opts.root ?? DEFAULT_ROOT });
    process.stdout.write((opts.json ? JSON.stringify(res, null, 2) : formatText(res, { quiet: opts.quiet })) + '\n');
    process.exitCode = res.ok ? 0 : 1;
  } catch (e) {
    process.stderr.write(`doctor: internal error: ${e && e.stack ? e.stack : String(e)}\n`);
    process.exitCode = 2;
  }
}
