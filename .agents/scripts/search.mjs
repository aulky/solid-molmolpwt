#!/usr/bin/env node
// search.mjs: code search without ripgrep. git grep inside a git work tree, else a built-in walker.
// Output: `relative/path:line: text` (forward slashes). Zero dependencies, Node >= 18.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import {
  IGNORE_DIRS, IGNORE_PATHS, MAX_FILE_BYTES, walk, readTextFile, splitLines, displayPath, toPosix,
  pathHasIgnoredSegment, makeGlobFilter,
} from './lib/walk.mjs';

const USAGE = `Usage: node .agents/scripts/search.mjs <regex> [path...] [options]

Search file contents. Prints "path:line: text" with paths relative to the current directory.

Options:
  -F, --fixed          treat <regex> as a literal string
  -i, --ignore-case    case-insensitive match
  -w, --word           match whole words only
  -g, --glob <glob>    only files matching <glob> (repeatable; "!<glob>" excludes).
                       No "/" = file name ("*.ts", "*auth*"); with "/" = relative path ("src/**/*.tsx")
  -C, --context <n>    show <n> lines around each match (context lines print as "path-line- text")
  -m, --max <n>        stop after <n> matching lines (default 100, 0 = no limit); with --files: <n> files
  -l, --files          print only the paths of matching files; with no <regex>: list every file that
                       passes --glob (a find-by-name replacement)
  -e <regex>           give the pattern explicitly (use when it starts with "-")
      --no-ignore      also search ignored dirs (automatic when the path itself is inside one)
      --no-git         use the built-in walker even inside a git work tree
  -h, --help           show this help

Regex syntax is JavaScript. Inside a git work tree this runs "git grep -P" over tracked and untracked,
non-ignored files (falls back to the walker when git rejects the pattern). Always skipped: binary files
(NUL byte), files > 1 MB, and the dirs ${IGNORE_DIRS.join(' ')} ${IGNORE_PATHS.join(' ')}.
Exit code: 0 = matches found, 1 = no matches, 2 = usage or internal error.

Examples (quote every pattern and glob; use single quotes when the pattern contains $):
  node .agents/scripts/search.mjs "createSignal\\(" src
  node .agents/scripts/search.mjs "TODO|FIXME" -i --glob "*.ts" --glob "!*.test.ts"
  node .agents/scripts/search.mjs "export (function|const) render" node_modules/solid-js --glob "*.d.ts"
  node .agents/scripts/search.mjs "useState" -C 2 --max 20
  node .agents/scripts/search.mjs --files --glob "*config*"
`;

const MAX_LINE = 240;

class UsageError extends Error {}

function parseArgs(argv) {
  const o = {
    pattern: null, paths: [], globs: [], fixed: false, icase: false, word: false, files: false,
    max: 100, context: 0, noIgnore: false, noGit: false, help: false,
  };
  const positional = [];
  const intArg = (name, v) => {
    if (v === undefined || !/^\d+$/.test(v)) throw new UsageError(`${name} needs a non-negative integer, got "${v ?? ''}"`);
    return Number(v);
  };
  // grep habits that are already the default here: accepted and ignored.
  const NOOP = new Set(['-r', '-R', '-n', '-H', '-I', '-E', '-P', '--recursive', '--line-number']);
  const args = [];
  for (const a of argv) {
    // Expand bundled boolean short flags: -iF, -rin, -il.
    if (/^-[iFwlhrRnHIEP]{2,}$/.test(a)) for (const ch of a.slice(1)) args.push('-' + ch);
    else args.push(a);
  }
  argv = args;
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (NOOP.has(a)) continue;
    let inline;
    const eq = a.startsWith('--') ? a.indexOf('=') : -1;
    if (eq > 0) {
      inline = a.slice(eq + 1);
      a = a.slice(0, eq);
    } else if (/^-[Cmge]./.test(a)) {
      inline = a.slice(2); // -C2, -m50, -g*.ts
      a = a.slice(0, 2);
    }
    const value = () => {
      if (inline !== undefined) return inline;
      if (i + 1 >= argv.length) throw new UsageError(`${a} needs a value`);
      return argv[++i];
    };
    switch (a) {
      case '-h': case '--help': o.help = true; break;
      case '-F': case '--fixed': case '--fixed-strings': o.fixed = true; break;
      case '-i': case '--ignore-case': o.icase = true; break;
      case '-w': case '--word': case '--word-regexp': o.word = true; break;
      case '-l': case '--files': case '--files-with-matches': o.files = true; break;
      case '--no-ignore': o.noIgnore = true; break;
      case '--no-git': o.noGit = true; break;
      case '-g': case '--glob': o.globs.push(value()); break;
      case '-C': case '--context': o.context = intArg(a, value()); break;
      case '-m': case '--max': case '--max-count': o.max = intArg(a, value()); break;
      case '-e': case '--regexp': o.pattern = value(); break;
      default:
        if (a.startsWith('-') && a.length > 1) throw new UsageError(`unknown option "${a}" (see --help)`);
        positional.push(argv[i]);
    }
  }
  if (o.pattern === null && positional.length) o.pattern = positional.shift();
  o.paths = positional;
  return o;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
}

// JS pattern -> PCRE pattern for git grep -P, or null when git cannot run it with the same meaning.
// `$` becomes `(?=\r?$)` so CRLF working-tree files (core.autocrlf) still match end-of-line anchors.
function toPcre(src) {
  if (/\\u|\\c|\[\^?\]/.test(src)) return null;
  let out = '';
  let inClass = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      out += c + (src[i + 1] ?? '');
      i++;
    } else if (inClass) {
      if (c === ']') inClass = false;
      out += c;
    } else if (c === '[') {
      inClass = true;
      out += c;
    } else if (c === '$') {
      out += '(?=\\r?$)';
    } else {
      out += c;
    }
  }
  return out;
}

function gitRun(args, cwd) {
  try {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
    if (r.error) return null;
    return r;
  } catch {
    return null;
  }
}

function gitExcludes() {
  const ex = IGNORE_DIRS.filter((d) => d !== '.git').map((d) => `:(exclude,glob)**/${d}/**`);
  for (const p of IGNORE_PATHS) ex.push(`:(exclude,glob)**/${p}/**`);
  return ex;
}

function clip(text, re) {
  let t = text.endsWith('\r') ? text.slice(0, -1) : text;
  if (t.length <= MAX_LINE) return t;
  let start = 0;
  if (re) {
    re.lastIndex = 0;
    const m = re.exec(t);
    if (m && m.index + m[0].length > MAX_LINE - 10) start = Math.max(0, m.index - 80);
  }
  return (start > 0 ? '...' : '') + t.slice(start, start + MAX_LINE) + (start + MAX_LINE < t.length ? '...' : '');
}

async function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`search: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
  if (o.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const listOnly = o.pattern === null;
  if (listOnly && !o.files) {
    process.stderr.write('search: missing <regex> (see --help)\n');
    return 2;
  }

  let re = null;
  let preRe = null;
  let userSrc = '';
  if (!listOnly) {
    userSrc = o.fixed ? escapeRegex(o.pattern) : o.pattern;
    const src = o.word ? `(?<![A-Za-z0-9_])(?:${userSrc})(?![A-Za-z0-9_])` : userSrc;
    const flags = o.icase ? 'i' : '';
    try {
      re = new RegExp(src, flags);
    } catch (e) {
      process.stderr.write(`search: invalid regular expression: ${e.message}\n` +
        'Use JavaScript regex syntax (no inline flags like (?i): use -i), or -F for a literal string.\n');
      return 2;
    }
    // Whole-file prefilter (superset of per-line matches) unless lookarounds could see across lines.
    if (!/\(\?<?[=!]/.test(userSrc)) preRe = new RegExp(userSrc, flags + 'm');
  }

  const cwd = process.cwd();
  const filter = makeGlobFilter(o.globs);
  const max = o.max === 0 ? Infinity : o.max;
  const st = {
    count: 0, truncated: false, groups: 0, out: [], notes: [], skippedLarge: 0, skippedBinary: 0,
  };
  const done = () => st.truncated;

  // Emit the matches of one file. matches: [{ n, text }]. getLines: () => string[] | null (for context).
  function emitFile(abs, matches, getLines) {
    const shown = displayPath(cwd, abs);
    if (o.files) {
      st.out.push(shown);
      return;
    }
    const lines = o.context > 0 ? getLines() : null;
    if (!lines) {
      for (const m of matches) st.out.push(`${shown}:${m.n}: ${clip(m.text, re)}`);
      return;
    }
    const matchSet = new Set(matches.map((m) => m.n));
    const ranges = [];
    for (const m of matches) {
      const a = Math.max(1, m.n - o.context);
      const b = Math.min(lines.length, m.n + o.context);
      const last = ranges[ranges.length - 1];
      if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
      else ranges.push([a, b]);
    }
    for (const [a, b] of ranges) {
      if (st.groups++ > 0) st.out.push('--');
      for (let n = a; n <= b; n++) {
        const sep = matchSet.has(n) ? ':' : '-';
        st.out.push(`${shown}${sep}${n}${sep} ${clip(lines[n - 1] ?? '', re)}`);
      }
    }
  }

  function readLines(abs) {
    const r = readTextFile(abs);
    if (r.skip) return null;
    return splitLines(r.text);
  }

  function dirExcluded(relRoot, relCwd) {
    // Emulate directory pruning by negative globs for paths that did not come from our walker.
    const a = relRoot.split('/');
    const b = relCwd.split('/');
    for (let k = 1; k < a.length; k++) {
      const bRel = b.length - (a.length - k) > 0 ? b.slice(0, b.length - (a.length - k)).join('/') : '';
      if (filter.pruneDir(a[k - 1], [a.slice(0, k).join('/'), bRel].filter(Boolean))) return true;
    }
    return false;
  }

  // Search a list/iterator of files with the JS engine. files yield { abs, relRoot, explicit }.
  function jsSearch(files) {
    for (const f of files) {
      if (done()) return;
      const relCwd = displayPath(cwd, f.abs);
      if (!f.explicit && !f.walked && filter.active && dirExcluded(f.relRoot, relCwd)) continue;
      if (!f.explicit && !filter.includeFile([f.relRoot, relCwd])) continue;
      if (listOnly) {
        let size = 0;
        try {
          size = fs.statSync(f.abs).size;
        } catch {
          continue;
        }
        if (size > MAX_FILE_BYTES) {
          st.skippedLarge++;
          continue;
        }
        if (st.count >= max) {
          st.truncated = true;
          return;
        }
        st.count++;
        st.out.push(relCwd);
        continue;
      }
      const r = readTextFile(f.abs);
      if (r.skip) {
        if (r.skip === 'large') st.skippedLarge++;
        if (r.skip === 'binary') st.skippedBinary++;
        if (f.explicit) st.notes.push(`skipped ${relCwd}: ${r.skip === 'large' ? 'larger than 1 MB' : r.skip}`);
        continue;
      }
      const text = r.text.includes('\r') ? r.text.replace(/\r\n/g, '\n') : r.text;
      if (preRe && !preRe.test(text)) continue;
      const lines = text.split('\n');
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      const matches = [];
      for (let i = 0; i < lines.length; i++) {
        if (!re.test(lines[i])) continue;
        if (st.count >= max) {
          st.truncated = true;
          break;
        }
        matches.push({ n: i + 1, text: lines[i] });
        st.count++;
        if (o.files) break;
      }
      if (matches.length) emitFile(f.abs, matches, () => lines);
    }
  }

  function* walkFiles(rootAbs, useIgnore) {
    const it = walk(rootAbs, {
      ignore: useIgnore,
      skipDir: (name, rel) => name === '.git' ||
        (filter.active && filter.pruneDir(name, [rel, displayPath(cwd, path.join(rootAbs, rel))])),
    });
    for (const e of it) yield { abs: e.abs, relRoot: e.rel, walked: true };
  }

  function* listedFiles(rootAbs, list) {
    for (const rel of list) yield { abs: path.join(rootAbs, rel), relRoot: rel };
  }

  // Run git grep -z and stream-parse. Returns true when git handled the search.
  function gitGrep(rootAbs) {
    const pcre = o.fixed ? null : toPcre(o.pattern);
    if (!o.fixed && pcre === null) return Promise.resolve(false);
    const args = ['-c', 'core.quotePath=false', 'grep', '-z', '-I', '--untracked', '--no-color'];
    args.push(o.files ? '-l' : '-n');
    if (o.icase) args.push('-i');
    if (o.word) args.push('-w');
    args.push(o.fixed ? '-F' : '-P', '-e', o.fixed ? o.pattern : pcre, '--', '.', ...gitExcludes());
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn('git', args, { cwd: rootAbs, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      } catch {
        resolve(false);
        return;
      }
      const startCount = st.count;
      const startOut = st.out.length;
      let buf = '';
      let killed = false;
      let cur = null; // { abs, matches }
      const sizeOk = new Map();
      const keep = (rel) => {
        const abs = path.join(rootAbs, rel);
        const relCwd = displayPath(cwd, abs);
        if (filter.active && (dirExcluded(rel, relCwd) || !filter.includeFile([rel, relCwd]))) return null;
        if (!sizeOk.has(abs)) {
          let ok = false;
          try {
            ok = fs.statSync(abs).size <= MAX_FILE_BYTES;
          } catch {}
          if (!ok) st.skippedLarge++;
          sizeOk.set(abs, ok);
        }
        return sizeOk.get(abs) ? abs : null;
      };
      const flush = () => {
        if (cur && cur.matches.length) emitFile(cur.abs, cur.matches, () => readLines(cur.abs));
        cur = null;
      };
      const stop = () => {
        if (killed) return;
        killed = true;
        try {
          child.kill();
        } catch {}
      };
      const onRecord = (rec) => {
        if (killed) return;
        if (o.files) {
          if (!rec) return;
          const abs = keep(rec);
          if (!abs) return;
          if (st.count >= max) {
            st.truncated = true;
            stop();
            return;
          }
          st.count++;
          emitFile(abs, [], null);
          return;
        }
        const a = rec.indexOf('\0');
        const b = a < 0 ? -1 : rec.indexOf('\0', a + 1);
        if (b < 0) return;
        const rel = rec.slice(0, a);
        const n = Number(rec.slice(a + 1, b));
        const text = rec.slice(b + 1);
        if (!cur || cur.rel !== rel) {
          flush();
          const abs = keep(rel);
          cur = { rel, abs, matches: [] };
        }
        if (!cur.abs) return;
        if (st.count >= max) {
          st.truncated = true;
          flush();
          stop();
          return;
        }
        st.count++;
        cur.matches.push({ n, text });
      };
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        buf += chunk;
        const sep = o.files ? '\0' : '\n';
        let idx;
        while (!killed && (idx = buf.indexOf(sep)) >= 0) {
          onRecord(buf.slice(0, idx));
          buf = buf.slice(idx + 1);
        }
      });
      child.stderr.on('data', () => {});
      child.on('error', () => {
        if (!killed) {
          st.count = startCount;
          st.out.length = startOut;
          resolve(false);
        }
      });
      child.on('close', (code) => {
        if (killed) {
          resolve(true);
          return;
        }
        if (buf) onRecord(buf);
        flush();
        if (code === 0 || code === 1) {
          resolve(true);
        } else {
          st.count = startCount; // git rejected the pattern or failed: undo and fall back
          st.out.length = startOut;
          resolve(false);
        }
      });
    });
  }

  const roots = o.paths.length ? o.paths : ['.'];
  let gitOk = !o.noGit;
  for (const root of roots) {
    if (done()) break;
    const rootAbs = path.resolve(root);
    let rst;
    try {
      rst = fs.statSync(rootAbs);
    } catch {
      process.stderr.write(`search: path not found: ${root}\n`);
      return 2;
    }
    if (rst.isFile()) {
      jsSearch([{ abs: rootAbs, relRoot: path.basename(rootAbs), explicit: true }]);
      continue;
    }
    const relToCwd = path.relative(cwd, rootAbs);
    const inside = !relToCwd.startsWith('..') && !path.isAbsolute(relToCwd);
    const useIgnore = !o.noIgnore && !pathHasIgnoredSegment(inside ? relToCwd : rootAbs);
    if (gitOk && useIgnore) {
      const probe = gitRun(['rev-parse', '--is-inside-work-tree'], rootAbs);
      if (probe === null) gitOk = false; // git not installed
      if (probe && probe.status === 0 && probe.stdout.trim() === 'true') {
        const ign = o.paths.length ? gitRun(['check-ignore', '-q', '--', '.'], rootAbs) : null;
        if (!(ign && ign.status === 0)) {
          if (!listOnly && (await gitGrep(rootAbs))) continue;
          const ls = gitRun(['-c', 'core.quotePath=false', 'ls-files', '-z', '-c', '-o', '--exclude-standard',
            '--', '.', ...gitExcludes()], rootAbs);
          if (ls && ls.status === 0) {
            const list = [...new Set(ls.stdout.split('\0').filter(Boolean))];
            jsSearch(listedFiles(rootAbs, list));
            continue;
          }
        }
      }
    }
    jsSearch(walkFiles(rootAbs, useIgnore));
  }

  if (st.truncated) {
    st.notes.push(`stopped after ${o.max} ${o.files || listOnly ? 'files' : 'matches'}; narrow the path or --glob, or raise --max`);
  }
  if (st.count === 0) {
    const what = listOnly ? 'No files matched' : `No matches for ${o.fixed ? JSON.stringify(o.pattern) : '/' + o.pattern + '/'}`;
    const extra = [];
    if (st.skippedLarge) extra.push(`${st.skippedLarge} file(s) > 1 MB skipped`);
    if (o.globs.length) extra.push(`globs: ${o.globs.join(' ')}`);
    st.out.push(`${what} in ${roots.map((r) => toPosix(r)).join(' ')}${extra.length ? ` (${extra.join('; ')})` : ''}.`);
  }
  for (const n of st.notes) st.out.push(`[search] ${n}`);
  if (st.out.length) process.stdout.write(st.out.join('\n') + '\n');
  return st.count > 0 ? 0 : 1;
}

process.stdout.on('error', (e) => {
  if (e && e.code === 'EPIPE') process.exit(0);
});

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`search: internal error: ${err && err.message ? err.message : String(err)}\n`);
    process.exitCode = 2;
  },
);
