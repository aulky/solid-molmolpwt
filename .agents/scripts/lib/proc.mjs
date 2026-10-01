// Process helpers for Frontier Kit scripts: PATH lookup, Windows-safe spawning (.cmd/.bat via cmd.exe
// with cross-spawn style escaping), capped output capture, and process-tree kill on timeout.
// Node >= 18, ESM, builtins only. Every function here is non-throwing unless documented.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const IS_WIN = process.platform === 'win32';

/** Case-insensitive env lookup on Windows (env objects copied from process.env keep "Path" casing). */
export function getEnv(env, name) {
  if (!env) return undefined;
  if (!IS_WIN) return env[name];
  const up = name.toUpperCase();
  for (const k of Object.keys(env)) if (k.toUpperCase() === up) return env[k];
  return undefined;
}

/** Copy of an env for children: drops NODE_TEST_CONTEXT (nested node --test misbehaves) and applies overrides. */
export function childEnv(base = process.env, extra = {}) {
  const out = {};
  const drop = new Set(['NODE_TEST_CONTEXT', ...Object.keys(extra).map((k) => (IS_WIN ? k.toUpperCase() : k))]);
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) continue;
    if (drop.has(IS_WIN ? k.toUpperCase() : k)) continue;
    out[k] = v;
  }
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null) out[k] = String(v);
  return out;
}

function pathExts(env) {
  if (!IS_WIN) return [''];
  return (getEnv(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD')
    .split(';').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

function isExecutable(p) {
  try {
    if (!fs.statSync(p).isFile()) return false;
    if (IS_WIN) return true;
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function candidates(base, env) {
  if (!IS_WIN) return [base];
  const exts = pathExts(env);
  const ext = path.extname(base).toLowerCase();
  if (ext && exts.includes(ext)) return [base];
  return exts.map((e) => base + e);
}

const whichCache = new Map();

/**
 * Resolve an executable like the OS would (PATH + PATHEXT on Windows). Commands containing a path
 * separator resolve relative to `cwd`. The current directory is NOT searched implicitly. Returns an
 * absolute path or null.
 */
export function which(cmd, { cwd = process.cwd(), env = process.env } = {}) {
  if (!cmd) return null;
  const PATH = getEnv(env, 'PATH') || '';
  const key = `${cmd}\0${cwd}\0${PATH}\0${getEnv(env, 'PATHEXT') || ''}`;
  if (whichCache.has(key)) return whichCache.get(key);
  let found = null;
  if (/[\\/]/.test(cmd) || path.isAbsolute(cmd)) {
    found = candidates(path.resolve(cwd, cmd), env).find(isExecutable) || null;
  } else {
    for (const raw of PATH.split(path.delimiter)) {
      const dir = raw.trim().replace(/^"(.*)"$/, '$1');
      if (!dir) continue;
      found = candidates(path.join(dir, cmd), env).find(isExecutable) || null;
      if (found) break;
    }
  }
  whichCache.set(key, found);
  return found;
}

function systemRoot() {
  return getEnv(process.env, 'SystemRoot') || getEnv(process.env, 'windir') || 'C:\\Windows';
}

function comspec() {
  return getEnv(process.env, 'ComSpec') || path.join(systemRoot(), 'System32', 'cmd.exe');
}

// cmd.exe escaping (same approach as the cross-spawn package): quote each argument with CommandLineToArgvW
// rules, then caret-escape every cmd metacharacter so cmd passes the text through literally.
const CMD_META = /([()\][%!^"`<>&|;, *?])/g;
function escapeCmdArg(arg, doubleEscape) {
  let a = String(arg);
  a = a.replace(/(\\*)"/g, '$1$1\\"');
  a = a.replace(/(\\*)$/, '$1$1');
  a = `"${a}"`.replace(CMD_META, '^$1');
  if (doubleEscape) a = a.replace(CMD_META, '^$1');
  return a;
}

/** Build the actual spawn file/args. On Windows, .cmd/.bat must go through cmd.exe (Node refuses them otherwise). */
export function spawnSpec(file, args = []) {
  if (IS_WIN && /\.(cmd|bat)$/i.test(file)) {
    const dbl = /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i.test(file);
    const line = [path.normalize(file).replace(CMD_META, '^$1'), ...args.map((a) => escapeCmdArg(a, dbl))].join(' ');
    return { file: comspec(), args: ['/d', '/s', '/c', `"${line}"`], verbatim: true };
  }
  return { file, args: args.map(String), verbatim: false };
}

/** Kill a process and all its descendants. Windows: taskkill /T /F. POSIX: signal the process group. */
export function killTree(pid) {
  if (!pid) return;
  if (IS_WIN) {
    try {
      spawnSync(path.join(systemRoot(), 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore', windowsHide: true, timeout: 15000,
      });
    } catch { /* already gone */ }
    return;
  }
  for (const target of [-pid, pid]) {
    try { process.kill(target, 'SIGTERM'); } catch { /* ignore */ }
  }
  const t = setTimeout(() => {
    for (const target of [-pid, pid]) {
      try { process.kill(target, 'SIGKILL'); } catch { /* ignore */ }
    }
  }, 1500);
  if (t.unref) t.unref();
}

class Tail {
  constructor(max) { this.max = max; this.parts = []; this.size = 0; this.dropped = 0; }
  push(buf) {
    this.parts.push(buf);
    this.size += buf.length;
    if (this.size > this.max * 2) this.compact();
  }
  compact() {
    const all = Buffer.concat(this.parts);
    const keep = all.length > this.max ? all.subarray(all.length - this.max) : all;
    this.dropped += all.length - keep.length;
    this.parts = [keep];
    this.size = keep.length;
  }
  text() { this.compact(); return this.parts[0] ? this.parts[0].toString('utf8') : ''; }
}

/**
 * Run a command without a shell and capture output (stdin ignored, nothing streamed).
 * Resolves (never rejects) to { exit, signal, output, stdout, stderr, droppedBytes, ms, timedOut, error }.
 * `exit` is null when the process could not start, was killed, or timed out.
 */
export function run(file, args = [], opts = {}) {
  const { cwd = process.cwd(), env = childEnv(), timeoutMs = 0, maxBytes = 512 * 1024 } = opts;
  return new Promise((resolve) => {
    const t0 = Date.now();
    const all = new Tail(maxBytes); const out = new Tail(maxBytes); const err = new Tail(maxBytes);
    let done = false; let timedOut = false; let exitInfo = null;
    const timers = [];
    let child;
    const finish = (code, signal, error) => {
      if (done) return;
      done = true;
      for (const t of timers) clearTimeout(t);
      resolve({
        exit: typeof code === 'number' && !timedOut ? code : null,
        signal: signal || null,
        output: all.text(), stdout: out.text(), stderr: err.text(),
        droppedBytes: all.dropped, ms: Date.now() - t0, timedOut, error: error || null,
      });
    };
    try {
      const spec = spawnSpec(file, args);
      child = spawn(spec.file, spec.args, {
        cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
        windowsVerbatimArguments: spec.verbatim, detached: !IS_WIN,
      });
    } catch (e) {
      finish(null, null, e && e.message ? e.message : String(e));
      return;
    }
    child.stdout.on('data', (b) => { all.push(b); out.push(b); });
    child.stderr.on('data', (b) => { all.push(b); err.push(b); });
    child.stdout.on('error', () => {});
    child.stderr.on('error', () => {});
    child.on('error', (e) => finish(null, null, e && e.message ? e.message : String(e)));
    child.on('exit', (code, signal) => {
      exitInfo = { code, signal };
      // A grandchild may keep the pipes open; do not wait for it forever.
      timers.push(setTimeout(() => {
        try { child.stdout.destroy(); child.stderr.destroy(); } catch { /* ignore */ }
        finish(code, signal);
      }, 2000));
    });
    child.on('close', (code, signal) => finish(exitInfo ? exitInfo.code : code, exitInfo ? exitInfo.signal : signal));
    if (timeoutMs > 0) {
      timers.push(setTimeout(() => {
        timedOut = true;
        killTree(child.pid);
        timers.push(setTimeout(() => finish(null, 'SIGKILL'), 5000));
      }, timeoutMs));
    }
  });
}

/** Strip ANSI escapes, normalise newlines, and keep only the final state of \r-rewritten progress lines. */
export function cleanOutput(text) {
  return String(text || '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matches an OSC escape (ESC ], terminated by BEL or ESC \) to strip it.
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matches a CSI escape (ESC [ ... final byte) to strip it.
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matches a single two-character escape (ESC + letter) to strip it.
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line.includes('\r') ? line.slice(line.lastIndexOf('\r') + 1) : line))
    .join('\n');
}

/** Last `n` non-trailing-empty lines of cleaned text, each trimmed to `width` chars. */
export function tailLines(text, n = 60, width = 300) {
  const lines = cleanOutput(text).replace(/\s+$/, '').split('\n');
  const picked = lines.length === 1 && lines[0] === '' ? [] : lines.slice(-n);
  return picked.map((l) => (l.length > width ? `${l.slice(0, width)}...` : l));
}
