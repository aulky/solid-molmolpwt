#!/usr/bin/env node
// secrets-scan.mjs - zero-dependency secret scanner. NEVER prints a secret value: every match is masked.
// Part of the Frontier Kit security-audit skill. Node >= 18, ESM, cross-platform.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const HELP = `Usage: node .agents/skills/security-audit/scripts/secrets-scan.mjs [path] [options]

Scans text files for committed secrets (cloud keys, tokens, private keys, credential URLs,
hard-coded passwords) and risky files (.env, *.pem, *.tfstate, id_rsa ...).
Every matched value is MASKED (first 4 chars + length). Inside a git repo it scans tracked and
untracked-but-not-ignored files (git ls-files); otherwise it walks the directory.

Options:
  --json               print JSON instead of text
  --min <sev>          report only findings >= high|medium|low (default: low)
  --max <n>            max findings printed (default: 200)
  --include-lockfiles  also scan lockfiles (skipped by default: integrity hashes are noise)
  --exclude <substr>   skip paths containing <substr> (repeatable)
  --no-git             walk the filesystem even inside a git repo
  --history            git only: list commits whose diffs added/removed well-known token prefixes
  --help               show this help

Suppress a reviewed false positive by putting "secrets-scan:allow" on that line.
Exit codes: 0 = no findings at/above --min, 1 = findings, 2 = usage or internal error.`;

export const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', '.output', '.next', '.nuxt',
  '.svelte-kit', '.vinxi', 'target', 'vendor', '.venv', 'venv', '__pycache__', 'coverage', '.turbo', '.cache',
  '.gradle', 'bin', 'obj', '.dart_tool', '.scratch']);
const GIT_SKIP_DIRS = new Set(['node_modules', 'vendor', '.venv', 'venv', '__pycache__']);
const IGNORE_REL_PREFIXES = ['.agents/.state/', '.agents/skills/security-audit/'];
const LOCKFILES = new Set(['bun.lock', 'bun.lockb', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml',
  'yarn.lock', 'Cargo.lock', 'go.sum', 'composer.lock', 'Gemfile.lock', 'poetry.lock', 'uv.lock', 'Pipfile.lock',
  'packages.lock.json', 'pubspec.lock', 'mix.lock', 'deno.lock', 'gradle.lockfile']);
const BINARY_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'avif', 'bmp', 'svgz', 'woff', 'woff2', 'ttf',
  'otf', 'eot', 'pdf', 'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'jar', 'war', 'class', 'exe', 'dll', 'so',
  'dylib', 'a', 'o', 'obj', 'lib', 'wasm', 'pyc', 'pyo', 'mp3', 'mp4', 'mov', 'avi', 'webm', 'wav', 'flac', 'ogg',
  'psd', 'sqlite', 'db', 'node', 'bin', 'lockb']);
const MAX_BYTES = 1024 * 1024;
const SEV_RANK = { high: 3, medium: 2, low: 1 };

// Patterns are assembled from pieces so this file never matches itself.
const P = (...parts) => new RegExp(parts.join(''), 'gd'); // d = match indices, used to mask the exact span
export const RULES = [
  { id: 'private-key', sev: 'high', re: P('-----BEGIN ', '(?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?', 'PRIVATE KEY', '(?: BLOCK)?-----'), desc: 'private key block' },
  { id: 'aws-access-key-id', sev: 'high', re: P('\\b(?:A', 'KIA|AS', 'IA|AB', 'IA|AC', 'CA)[0-9A-Z]{16}\\b'), desc: 'AWS access key id' },
  { id: 'aws-secret-key', sev: 'high', re: P('(?:aws|AWS)[A-Za-z0-9_]{0,20}(?:secret|SECRET)[A-Za-z0-9_]{0,20}\\s*[:=]\\s*["\']?([A-Za-z0-9/+]{40})(?![A-Za-z0-9/+])'), group: 1, desc: 'AWS secret access key' },
  { id: 'github-token', sev: 'high', re: P('\\bgh', '[pousr]_[A-Za-z0-9]{36,255}\\b'), desc: 'GitHub token' },
  { id: 'github-fine-grained-pat', sev: 'high', re: P('\\bgithub', '_pat_[A-Za-z0-9_]{22,255}\\b'), desc: 'GitHub fine-grained PAT' },
  { id: 'gitlab-token', sev: 'high', re: P('\\bgl', 'pat-[A-Za-z0-9_-]{20,}\\b'), desc: 'GitLab personal access token' },
  { id: 'slack-token', sev: 'high', re: P('\\bxo', 'x[baprs]-[A-Za-z0-9-]{10,}\\b'), desc: 'Slack token' },
  { id: 'slack-webhook', sev: 'medium', re: P('https://hooks\\.slack\\.com/', 'services/T[A-Za-z0-9_]+/B[A-Za-z0-9_]+/[A-Za-z0-9_]+'), desc: 'Slack incoming webhook URL' },
  { id: 'stripe-secret-key', sev: 'high', re: P('\\b(?:sk|rk)', '_live_[A-Za-z0-9]{16,}\\b'), desc: 'Stripe live secret/restricted key' },
  { id: 'stripe-test-key', sev: 'low', re: P('\\b(?:sk|rk)', '_test_[A-Za-z0-9]{16,}\\b'), desc: 'Stripe test secret key' },
  { id: 'google-api-key', sev: 'medium', re: P('\\bAI', 'za[0-9A-Za-z_-]{35}\\b'), desc: 'Google API key (Firebase web keys are public by design: restrict by referrer/API instead)' },
  { id: 'google-oauth-secret', sev: 'high', re: P('\\bGOC', 'SPX-[A-Za-z0-9_-]{28}\\b'), desc: 'Google OAuth client secret' },
  { id: 'openai-key', sev: 'high', re: P('\\bsk-', '(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}'), desc: 'OpenAI API key' },
  { id: 'anthropic-key', sev: 'high', re: P('\\bsk-', 'ant-(?:api|admin)[0-9]{2}-[A-Za-z0-9_-]{20,}'), desc: 'Anthropic API key' },
  { id: 'huggingface-token', sev: 'high', re: P('\\bhf', '_[A-Za-z0-9]{34,}\\b'), desc: 'Hugging Face token' },
  { id: 'npm-token', sev: 'high', re: P('\\bnp', 'm_[A-Za-z0-9]{36}\\b'), desc: 'npm access token' },
  { id: 'pypi-token', sev: 'high', re: P('\\bpy', 'pi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}'), desc: 'PyPI upload token' },
  { id: 'sendgrid-key', sev: 'high', re: P('\\bSG', '\\.[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}\\b'), desc: 'SendGrid API key' },
  { id: 'shopify-token', sev: 'high', re: P('\\bshp', '(?:at|ss|ca|pa)_[a-fA-F0-9]{32}\\b'), desc: 'Shopify token' },
  { id: 'digitalocean-token', sev: 'high', re: P('\\bdo', 'p_v1_[a-f0-9]{64}\\b'), desc: 'DigitalOcean token' },
  { id: 'azure-storage-conn', sev: 'high', re: P('AccountKey', '=([A-Za-z0-9+/=]{40,})'), group: 1, desc: 'Azure storage account key' },
  { id: 'npmrc-auth-token', sev: 'high', re: P('_auth', 'Token\\s*=\\s*([^\\s$][^\\s]{8,})'), group: 1, desc: '.npmrc registry auth token' },
  { id: 'jwt', sev: 'medium', re: P('\\bey', 'J[A-Za-z0-9_-]{10,}\\.ey', 'J[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}'), desc: 'JSON Web Token (may be a test fixture - check expiry/issuer)' },
  { id: 'credential-url', sev: 'high', re: P('\\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\\+srv)?|redis|rediss|amqps?|mssql|sqlserver|ftp|smtp)://[^\\s:/@"\'`]+:([^\\s@"\'`]{3,})@([^\\s/:"\'`]+)'), group: 1, desc: 'connection URL with embedded password' },
  { id: 'hardcoded-secret', sev: 'medium', re: P('(?:api[_-]?key|apikey|secret[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|private[_-]?key|passw(?:or)?d|pwd|secret|token)["\']?\\s*(?::|=|:=|=>)\\s*["\'`]([^"\'`\\s]{8,})["\'`]', ''), group: 1, flags: 'gi', generic: true, desc: 'hard-coded credential assignment' },
];
for (const r of RULES) if (r.flags) r.re = new RegExp(r.re.source, `${r.flags}d`);

const PLACEHOLDER = /^(?:x+|\*+|\.+|-+|_+|0+|<[^>]*>|\$\{[^}]*\}|\{\{[^}]*\}\}|%[^%]*%|\$[A-Z_][A-Z0-9_]*|changeme|change_me|changeit|password|passwd|secret|example|examples|dummy|sample|test|testing|fake|mock|redacted|null|none|undefined|todo|tbd|placeholder|your[-_ ].*|.*[-_]here|.*example.*|.*placeholder.*|.*dummy.*|.*redacted.*)$/i;
const CODE_REF = /(?:process\.env|import\.meta\.env|os\.environ|getenv|ENV\[|env\(|config\(|settings\.|\$\{|\{\{)/;
const LOCAL_HOSTS = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|mysql|redis|mongo|mongodb|rabbitmq|host\.docker\.internal)$/i;
const TESTISH = /(?:^|\/)(?:tests?|__tests__|spec|specs|fixtures?|mocks?|examples?|samples?|testdata|docs?)\/|\.(?:test|spec)\.|(?:^|\/)[^/]*(?:example|sample|fixture)[^/]*$/i;

export function mask(v) {
  const s = String(v);
  const keep = s.length >= 16 ? 4 : s.length >= 10 ? 2 : 1;
  return `${s.slice(0, keep)}...[${s.length}]`;
}

export function shannon(s) {
  const m = new Map();
  for (const ch of s) m.set(ch, (m.get(ch) || 0) + 1);
  let h = 0;
  for (const n of m.values()) { const p = n / s.length; h -= p * Math.log2(p); }
  return h;
}

function downgrade(sev) { return sev === 'high' ? 'medium' : 'low'; }

// Scan one text buffer. Returns findings with masked values only.
export function scanText(text, rel) {
  const out = [];
  const lines = text.split(/\r?\n/);
  const testish = TESTISH.test(rel);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 4000 || line.includes('secrets-scan:allow')) continue;
    const hits = [];
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line)) !== null) {
        if (m[0].length === 0) { rule.re.lastIndex++; continue; }
        const value = rule.group ? m[rule.group] : m[0];
        if (!value) continue;
        let sev = rule.sev;
        const notes = [];
        if (rule.generic) {
          if (PLACEHOLDER.test(value) || CODE_REF.test(value) || shannon(value) < 3.0) continue;
          if (/^[a-z]+$/i.test(value) && value.length < 16) continue; // plain words
        }
        if (rule.id === 'credential-url') {
          const host = m[2] || '';
          if (PLACEHOLDER.test(value) || CODE_REF.test(value)) continue;
          if (LOCAL_HOSTS.test(host)) { sev = 'low'; notes.push('local/dev host'); }
        }
        const end = m.index + m[0].length;
        if (hits.some((h) => h.start < end && m.index < h.end)) continue; // overlapping: keep the earlier (more specific) rule
        const [vStart, vEnd] = rule.group && m.indices && m.indices[rule.group] ? m.indices[rule.group] : [m.index, end];
        if (testish && sev !== 'low') { sev = downgrade(sev); notes.push('test/example path - downgraded'); }
        hits.push({ start: m.index, end, vStart, vEnd, rule, value, sev, notes });
      }
    }
    if (!hits.length) continue;
    let ctx = line;
    for (const h of [...hits].sort((a, b) => b.vStart - a.vStart)) {
      ctx = ctx.slice(0, h.vStart) + mask(h.value) + ctx.slice(h.vEnd);
    }
    ctx = ctx.trim();
    if (ctx.length > 140) ctx = `${ctx.slice(0, 137)}...`;
    for (const h of hits) {
      out.push({ severity: h.sev, rule: h.rule.id, file: rel, line: i + 1, masked: mask(h.value), context: ctx,
        note: [h.rule.desc, ...h.notes].join('; ') });
    }
  }
  return out;
}

const RISKY_FILES = [
  { test: (b) => /^\.env(?:\..+)?$/i.test(b) && !/\.(?:example|sample|template|dist|defaults|schema)$/i.test(b), id: 'env-file', desc: 'environment file with real values' },
  { test: (b) => /\.(?:pem|key|p12|pfx|jks|keystore|ppk|asc)$/i.test(b) && !/\.pub$/i.test(b), id: 'key-file', desc: 'key/certificate store file' },
  { test: (b) => /^id_(?:rsa|dsa|ecdsa|ed25519)$/i.test(b), id: 'ssh-private-key-file', desc: 'SSH private key file' },
  { test: (b) => /\.tfstate(?:\.backup)?$/i.test(b), id: 'terraform-state', desc: 'Terraform state (stores secrets in plaintext)' },
  { test: (b) => /^\.git-credentials$|^\.pgpass$|^\.netrc$|^_netrc$/i.test(b), id: 'credential-store-file', desc: 'plaintext credential store' },
  { test: (b) => /\.kdbx$/i.test(b), id: 'password-db', desc: 'password database' },
];

export function riskyFile(rel) {
  const base = rel.split('/').pop();
  for (const r of RISKY_FILES) if (r.test(base)) return r;
  return null;
}

function gitignoreCovers(root, rel) {
  // Rough check used only outside git: does any .gitignore line look like it covers this basename?
  try {
    const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    const base = rel.split('/').pop();
    return gi.some((pat) => {
      const p = pat.replace(/^\//, '').replace(/\/$/, '');
      if (p === base || p === rel) return true;
      if (p.includes('*')) {
        const re = new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
        return re.test(base) || re.test(rel);
      }
      return false;
    });
  } catch { return false; }
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

function gitRoot(dir) {
  const r = run('git', ['rev-parse', '--show-toplevel'], dir);
  return r.code === 0 ? r.out.trim() : null;
}

function walk(root, start, files) {
  const stack = [start];
  while (stack.length) {
    const dir = stack.pop();
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name)) continue;
        if (IGNORE_REL_PREFIXES.some((p) => `${rel}/`.startsWith(p))) continue;
        stack.push(abs);
      } else if (e.isFile()) files.push(rel);
    }
  }
}

function parseArgs(argv) {
  const o = { target: null, json: false, min: 'low', max: 200, lock: false, exclude: [], git: true, history: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--json') o.json = true;
    else if (a === '--min') { o.min = need().toLowerCase(); if (!SEV_RANK[o.min]) throw new Error('--min must be high|medium|low'); }
    else if (a === '--max') { o.max = Number.parseInt(need(), 10); if (!(o.max > 0)) throw new Error('--max must be a positive integer'); }
    else if (a === '--include-lockfiles') o.lock = true;
    else if (a === '--exclude') o.exclude.push(need().replace(/\\/g, '/'));
    else if (a === '--no-git') o.git = false;
    else if (a === '--history') o.history = true;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else if (!o.target) o.target = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  return o;
}

const HISTORY_PREFIXES = ['PRIVATE KEY-----', 'AKIA', 'ghp_', 'gho_', 'github_pat_', 'glpat-', 'xoxb-', 'xoxp-', 'sk_live_',
  'sk-ant-', 'sk-proj-', 'GOCSPX-', 'AccountKey=', '_authToken='];

export function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(`secrets-scan: ${e.message}\n\n${HELP}`); return 2; }
  if (o.help) { console.log(HELP); return 0; }
  const start = path.resolve(o.target || '.');
  if (!fs.existsSync(start)) { console.error(`secrets-scan: path not found: ${start}`); return 2; }
  const groot = o.git ? gitRoot(fs.statSync(start).isDirectory() ? start : path.dirname(start)) : null;
  const root = groot ? path.resolve(groot) : (fs.statSync(start).isDirectory() ? start : path.dirname(start));
  let files = [];
  let tracked = null;
  let mode = 'walk';
  if (groot) {
    const scope = path.relative(root, start).split(path.sep).join('/') || '.';
    const all = run('git', ['ls-files', '-z', '-co', '--exclude-standard', '--', scope], root);
    const tr = run('git', ['ls-files', '-z', '--', scope], root);
    if (all.code === 0) {
      mode = 'git';
      files = all.out.split('\0').filter(Boolean);
      tracked = new Set(tr.out.split('\0').filter(Boolean));
      files = files.filter((f) => !f.split('/').some((seg) => GIT_SKIP_DIRS.has(seg)));
      files = files.filter((f) => !IGNORE_REL_PREFIXES.some((p) => f.startsWith(p)));
    }
  }
  if (mode === 'walk') {
    if (fs.statSync(start).isFile()) files = [path.relative(root, start).split(path.sep).join('/')];
    else walk(root, start, files);
  }
  if (o.exclude.length) files = files.filter((f) => !o.exclude.some((x) => f.includes(x)));
  files.sort();

  const findings = [];
  let scanned = 0;
  const skipped = { binary: 0, large: 0, lockfile: 0, unreadable: 0 };
  for (const rel of files) {
    const abs = path.join(root, rel);
    const base = rel.split('/').pop();
    const ext = base.includes('.') ? base.split('.').pop().toLowerCase() : '';
    const risky = riskyFile(rel);
    if (risky) {
      let sev = 'high';
      let note = risky.desc;
      if (mode === 'git') {
        note += tracked && tracked.has(rel) ? '; TRACKED by git' : '; untracked and not ignored - `git add .` would commit it';
      } else if (gitignoreCovers(root, rel)) { sev = 'low'; note += '; present locally, matched by .gitignore'; }
      else note += '; not matched by .gitignore';
      if (TESTISH.test(rel) && sev === 'high') { sev = 'medium'; note += '; test/example path - downgraded'; }
      findings.push({ severity: sev, rule: risky.id, file: rel, line: 0, masked: '', context: '', note });
    }
    if (LOCKFILES.has(base) && !o.lock) { skipped.lockfile++; continue; }
    if (BINARY_EXT.has(ext) || /\.min\.(?:js|css)$|\.map$/i.test(base)) { skipped.binary++; continue; }
    let st;
    try { st = fs.statSync(abs); } catch { skipped.unreadable++; continue; }
    if (!st.isFile()) continue;
    if (st.size > MAX_BYTES) { skipped.large++; continue; }
    let buf;
    try { buf = fs.readFileSync(abs); } catch { skipped.unreadable++; continue; }
    if (buf.subarray(0, 8000).includes(0)) { skipped.binary++; continue; }
    scanned++;
    for (const f of scanText(buf.toString('utf8'), rel)) {
      if (mode === 'git' && tracked && !tracked.has(rel)) f.note += '; file untracked';
      findings.push(f);
    }
  }

  const history = [];
  if (o.history) {
    if (!groot) history.push({ error: 'not a git repository - history scan skipped' });
    else {
      for (const pre of HISTORY_PREFIXES) {
        const r = run('git', ['log', '--all', '-S', pre, '--format=%h %ad', '--date=short', '--name-only', '--',
          '.', ':(exclude).agents/skills/security-audit'], root);
        if (r.code !== 0) { history.push({ prefix: pre, error: r.err.trim().split('\n')[0] }); continue; }
        const commits = [];
        let cur = null;
        for (const l of r.out.split(/\r?\n/)) {
          if (/^[0-9a-f]{7,40} \d{4}-\d{2}-\d{2}$/.test(l)) { cur = { commit: l.split(' ')[0], date: l.split(' ')[1], files: [] }; commits.push(cur); }
          else if (l.trim() && cur) cur.files.push(l.trim());
        }
        if (commits.length) history.push({ prefix: `${pre.slice(0, 4)}...`, commits: commits.slice(0, 20) });
      }
    }
  }

  const minRank = SEV_RANK[o.min];
  const shown = findings.filter((f) => SEV_RANK[f.severity] >= minRank)
    .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || a.file.localeCompare(b.file) || a.line - b.line);
  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of shown) counts[f.severity]++;
  const result = { tool: 'secrets-scan', mode, root: root.split(path.sep).join('/'), scanned, skipped, counts,
    findings: shown.slice(0, o.max), truncated: Math.max(0, shown.length - o.max), history };

  if (fs.existsSync(path.join(root, '.agents'))) {
    try {
      const dir = path.join(root, '.agents', '.state', 'security');
      fs.mkdirSync(dir, { recursive: true });
      const tmp = path.join(dir, `secrets-scan.json.${process.pid}.tmp`);
      fs.writeFileSync(tmp, JSON.stringify({ ts: Date.now(), ...result }, null, 2));
      fs.renameSync(tmp, path.join(dir, 'secrets-scan.json'));
    } catch { /* state is optional */ }
  }

  if (o.json) console.log(JSON.stringify(result, null, 2));
  else {
    const sk = Object.entries(skipped).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
    console.log(`SECRETS-SCAN: ${mode} mode, scanned ${scanned} files (skipped: ${sk}); values are masked`);
    for (const f of result.findings) {
      const loc = f.line ? `${f.file}:${f.line}` : f.file;
      console.log(`${f.severity.toUpperCase().padEnd(6)} ${loc}  [${f.rule}] ${f.masked ? `${f.masked}  ` : ''}- ${f.note}`);
      if (f.context) console.log(`       | ${f.context}`);
    }
    if (result.truncated) console.log(`... ${result.truncated} more (raise --max or use --json)`);
    for (const h of history) {
      if (h.error) console.log(`HISTORY ${h.prefix || ''} ${h.error}`);
      else for (const c of h.commits) console.log(`HISTORY ${h.prefix} ${c.commit} ${c.date} ${c.files.slice(0, 5).join(', ')}`);
    }
    const total = counts.high + counts.medium + counts.low;
    const histN = history.reduce((n, h) => n + (h.commits ? h.commits.length : 0), 0);
    const histTxt = o.history ? `, ${histN} history hits` : '';
    console.log(`SUMMARY: ${counts.high} high, ${counts.medium} medium, ${counts.low} low${histTxt} -> ${total || histN ? 'FINDINGS' : 'CLEAN'}`);
  }
  return shown.length || history.some((h) => h.commits && h.commits.length) ? 1 : 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  let code = 2;
  try { code = main(process.argv.slice(2)); } catch (e) { console.error(`secrets-scan: internal error: ${e && e.message}`); code = 2; }
  process.exitCode = code;
}
