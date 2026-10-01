// Shared file-walking helpers for Frontier Kit scripts (search, repo-map, kit-install).
// Zero dependencies, Node >= 18 ESM. Paths returned to callers use forward slashes.
import fs from 'node:fs';
import path from 'node:path';

// .agents/docs/architecture.md: ignore these directories everywhere.
export const IGNORE_DIRS = Object.freeze([
  '.git', 'node_modules', 'dist', 'build', 'out', '.output', '.next', '.nuxt', '.svelte-kit', '.vinxi',
  'target', 'vendor', '.venv', 'venv', '__pycache__', 'coverage', '.turbo', '.cache', '.gradle', 'bin',
  'obj', '.dart_tool', '.scratch',
]);
// Multi-segment ignored paths (matched as a path suffix of a directory).
export const IGNORE_PATHS = Object.freeze(['.agents/.state']);

const IGNORE_SET = new Set(IGNORE_DIRS);
export const IS_WIN = process.platform === 'win32';
export const MAX_FILE_BYTES = 1024 * 1024;
export const BINARY_SNIFF_BYTES = 8000;
// Hard recursion-depth ceiling for walkDir, independent of the OS/filesystem. Windows directory
// *junctions* (NTFS mount points) are a reparse-point cycle risk the "never follow symlinked
// directories" guard below might not always catch: whether `Dirent.isSymbolicLink()` /
// `fs.lstatSync().isSymbolicLink()` flag a given reparse-point kind as a link has differed across
// Node/libuv versions on Windows. This cap bounds worst-case descent regardless of whether that
// detection is accurate for a given kind/version; the real-path cycle guard next to it (see `walk`)
// is the primary, more targeted defense.
export const MAX_WALK_DEPTH = 200;

/** Convert a native path to forward slashes. */
export function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

/** Relative path from `from` to `to`, forward slashes, '.' for the same path. */
export function relPosix(from, to) {
  return toPosix(path.relative(from, to)) || '.';
}

/** Path for display: relative to `base` when inside it, else absolute (forward slashes). */
export function displayPath(base, abs) {
  const rel = path.relative(base, abs);
  if (!rel) return '.';
  if (rel.startsWith('..') || path.isAbsolute(rel)) return toPosix(abs);
  return toPosix(rel);
}

/** True when a directory (name + posix path relative to the walk root) is in the ignore list. */
export function isIgnoredDir(name, rel = name) {
  if (IGNORE_SET.has(name)) return true;
  return IGNORE_PATHS.some((p) => rel === p || rel.endsWith('/' + p));
}

/** True when any segment of the given path (as given, not resolved) is an ignored directory. */
export function pathHasIgnoredSegment(p) {
  const posix = toPosix(p);
  if (posix.split('/').some((s) => IGNORE_SET.has(s))) return true;
  const wrapped = '/' + posix.replace(/^\/+|\/+$/g, '') + '/';
  return IGNORE_PATHS.some((ip) => wrapped.includes('/' + ip + '/'));
}

/** NUL byte in the first 8000 bytes (same heuristic as git) => binary. */
export function isBinaryBuffer(buf) {
  const n = Math.min(buf.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/** Read a text file; returns { text } or { skip: 'binary'|'large'|'unreadable' }. CRLF is kept. */
export function readTextFile(abs, maxBytes = MAX_FILE_BYTES) {
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return { skip: 'unreadable' };
  }
  if (!st.isFile()) return { skip: 'unreadable' };
  if (st.size > maxBytes) return { skip: 'large', size: st.size };
  let buf;
  try {
    buf = fs.readFileSync(abs);
  } catch {
    return { skip: 'unreadable' };
  }
  if (isBinaryBuffer(buf)) return { skip: 'binary' };
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text, size: st.size };
}

/** Split text into lines (handles LF and CRLF); a trailing newline does not create an extra line. */
export function splitLines(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// Resolve a directory's real (link-free) path for the cycle guard. Returns null when it cannot be
// resolved (dangling reparse point, permission error, etc.) — callers then fall back to the depth cap.
function realDirKey(abs) {
  try {
    const real = fs.realpathSync.native ? fs.realpathSync.native(abs) : fs.realpathSync(abs);
    return IS_WIN ? real.toLowerCase() : real;
  } catch {
    return null;
  }
}

/**
 * Walk a directory tree depth-first in sorted order, yielding files (and optionally directories).
 * Options:
 *   ignore      (default true)  prune IGNORE_DIRS / IGNORE_PATHS (never prunes the root itself)
 *   skipDir     (name, rel) => bool  extra pruning predicate
 *   maxDepth    directory depth limit (root = 0; files at depth maxDepth+1 are not yielded)
 *   dirs        also yield directory entries ({ isDir: true })
 *   onError     (err, abs) => void
 * Yields { abs, rel, name, isDir, depth } with `rel` relative to root (forward slashes).
 * Cycle safety (belt and suspenders — see MAX_WALK_DEPTH above for why both exist):
 *   1. Symlinked directories are never followed (symlinked files are yielded).
 *   2. Every directory actually descended into (including the root) has its real path tracked on the
 *      current DFS branch; a child whose real path is already on that branch (e.g. a Windows junction
 *      that re-enters an ancestor) is reported via onError and skipped, not descended into.
 *   3. A hard depth ceiling (MAX_WALK_DEPTH) stops runaway descent regardless of (1)/(2).
 */
export function* walk(root, opts = {}) {
  const { ignore = true, skipDir = null, maxDepth = Infinity, dirs = false, onError = null } = opts;
  const rootAbs = path.resolve(root);
  const visiting = new Set(); // real-path keys currently on the DFS stack
  const rootKey = realDirKey(rootAbs);
  if (rootKey !== null) visiting.add(rootKey);
  yield* walkDir(rootAbs, '', 0);

  function* walkDir(abs, rel, depth) {
    if (depth > MAX_WALK_DEPTH) {
      if (onError) onError(new Error(`max directory depth (${MAX_WALK_DEPTH}) exceeded`), abs);
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch (err) {
      if (onError) onError(err, abs);
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const ent of entries) {
      const childAbs = path.join(abs, ent.name);
      const childRel = rel ? rel + '/' + ent.name : ent.name;
      let isDir = ent.isDirectory();
      let isFile = ent.isFile();
      if (ent.isSymbolicLink()) {
        try {
          const st = fs.statSync(childAbs);
          isFile = st.isFile();
          isDir = false; // never follow directory links
        } catch {
          continue;
        }
      }
      if (isDir) {
        if (ignore && isIgnoredDir(ent.name, childRel)) continue;
        if (skipDir && skipDir(ent.name, childRel)) continue;
        if (dirs) yield { abs: childAbs, rel: childRel, name: ent.name, isDir: true, depth: depth + 1 };
        if (depth + 1 <= maxDepth) {
          const key = realDirKey(childAbs);
          if (key !== null && visiting.has(key)) {
            if (onError) onError(new Error(`cycle: ${childAbs} re-enters an ancestor directory (reparse point?)`), childAbs);
            continue;
          }
          if (key !== null) visiting.add(key);
          yield* walkDir(childAbs, childRel, depth + 1);
          if (key !== null) visiting.delete(key);
        }
      } else if (isFile) {
        yield { abs: childAbs, rel: childRel, name: ent.name, isDir: false, depth: depth + 1 };
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Globs: *, **, ?, [abc], [!abc], {a,b}. A pattern without "/" matches the basename; a pattern
// with "/" matches the whole relative path. A trailing "/" means "a directory with this name".

function globSource(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '[') {
      const end = glob.indexOf(']', i + 2);
      if (end === -1) {
        re += '\\[';
      } else {
        let body = glob.slice(i + 1, end);
        if (body[0] === '!') body = '^' + body.slice(1);
        re += '[' + body.replace(/\\/g, '\\\\') + ']';
        i = end;
      }
    } else if (c === '{') {
      let depth = 0;
      let end = -1;
      for (let j = i; j < glob.length; j++) {
        if (glob[j] === '{') depth++;
        else if (glob[j] === '}' && --depth === 0) {
          end = j;
          break;
        }
      }
      if (end === -1) {
        re += '\\{';
      } else {
        const alts = [];
        let d = 0;
        let start = i + 1;
        for (let j = i + 1; j < end; j++) {
          if (glob[j] === '{') d++;
          else if (glob[j] === '}') d--;
          else if (glob[j] === ',' && d === 0) {
            alts.push(glob.slice(start, j));
            start = j + 1;
          }
        }
        alts.push(glob.slice(start, end));
        re += '(?:' + alts.map(globSource).join('|') + ')';
        i = end;
      }
    } else if ('\\^$.|+()]}'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return re;
}

/** Compile one glob. Returns { negate, basename, dirOnly, re, source }. */
export function compileGlob(pattern, { nocase = IS_WIN } = {}) {
  let p = toPosix(String(pattern).trim());
  let negate = false;
  if (p.startsWith('!')) {
    negate = true;
    p = p.slice(1);
  }
  while (p.startsWith('./')) p = p.slice(2);
  let dirOnly = false;
  if (p.length > 1 && p.endsWith('/')) {
    dirOnly = true;
    p = p.replace(/\/+$/, '');
  }
  const anchored = p.startsWith('/');
  if (anchored) p = p.replace(/^\/+/, '');
  const basename = !anchored && !p.includes('/');
  let src = globSource(p);
  if (dirOnly) src = basename ? '(?:.*/)?' + src + '/.*' : src + '/.*';
  const re = new RegExp('^' + src + '$', nocase ? 'i' : '');
  return { negate, basename: basename && !dirOnly, dirOnly, re, source: pattern };
}

/**
 * Build a filter from --glob patterns (repeatable, "!" negates).
 * includeFile(candidates): candidates = array of relative paths (e.g. [relToRoot, relToCwd]);
 *   included when (no positive globs OR any positive matches) AND no negative matches.
 * pruneDir(name, candidates): true when a negative glob matches the directory itself.
 */
export function makeGlobFilter(globs = [], opts = {}) {
  const compiled = globs.filter((g) => String(g).trim() !== '').map((g) => compileGlob(g, opts));
  const pos = compiled.filter((g) => !g.negate);
  const neg = compiled.filter((g) => g.negate);
  const test = (g, rel) => {
    if (g.basename) return g.re.test(rel.slice(rel.lastIndexOf('/') + 1));
    return g.re.test(rel);
  };
  return {
    active: compiled.length > 0,
    includeFile(candidates) {
      const list = Array.isArray(candidates) ? candidates : [candidates];
      if (neg.some((g) => list.some((r) => test(g, r)))) return false;
      if (!pos.length) return true;
      return pos.some((g) => list.some((r) => test(g, r)));
    },
    pruneDir(name, candidates) {
      if (!neg.length) return false;
      const list = Array.isArray(candidates) ? candidates : [candidates];
      return neg.some((g) => {
        if (g.basename) return g.re.test(name);
        return list.some((r) => g.re.test(r) || g.re.test(r + '/'));
      });
    },
  };
}
