// node --test .agents/scripts/test/search.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MAX_WALK_DEPTH } from '../lib/walk.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '..', 'search.mjs');
const TMP_BASE = process.env.KIT_TEST_TMPDIR || os.tmpdir();
let tmp;
let fx;
let gitFx = null;

function run(args, cwd = fx) {
  // A generous but finite timeout: a runaway cycle (e.g. an unguarded directory-junction loop)
  // must fail the test, not hang the suite.
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', windowsHide: true, timeout: 20000 });
  assert.ok(!r.error || r.error.code !== 'ETIMEDOUT', `search.mjs timed out (possible infinite recursion): ${args.join(' ')}`);
  return { code: r.status, out: r.stdout.replace(/\r\n/g, '\n'), err: r.stderr, lines: r.stdout.split(/\r?\n/).filter(Boolean) };
}

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function makeFixture(root) {
  write(root, 'src/app.ts', "import { x } from './x';\nexport function hello() {\n  return 42;\n}\n// TODO: fix\n");
  write(root, 'src/util.test.ts', "test('hello', () => {});\n// TODO test\n");
  write(root, 'src/deep/a.tsx', 'const A = () => <div>Hello World</div>;\n');
  write(root, 'docs/readme.md', 'TODO in docs\nPrice: $5 (a.b)\n');
  write(root, 'crlf.txt', 'alpha end\r\nbeta\r\n');
  write(root, 'bin.dat', Buffer.concat([Buffer.from([0x00, 0x01, 0x02]), Buffer.from(' TODO binary\n')]));
  write(root, 'big.txt', 'TODO big\n' + 'z'.repeat(1024 * 1024 + 10) + '\n');
  write(root, 'node_modules/pkg/index.js', '// TODO in node_modules\n');
  write(root, 'dist/out.js', '// TODO in dist\n');
  write(root, '.agents/.state/x.json', '{"TODO": "state"}\n');
  write(root, 'long.txt', 'x'.repeat(500) + 'NEEDLE' + 'y'.repeat(500) + '\n');
  write(root, 'ctx.txt', ['l1', 'l2', 'hit3', 'l4', 'hit5', 'l6', 'l7', 'l8', 'hit9', 'l10'].join('\n') + '\n');
}

before(() => {
  fs.mkdirSync(TMP_BASE, { recursive: true });
  tmp = fs.mkdtempSync(path.join(TMP_BASE, 'search-test-'));
  fx = path.join(tmp, 'plain');
  makeFixture(fx);
  const probe = spawnSync('git', ['--version'], { encoding: 'utf8', windowsHide: true });
  if (!probe.error && probe.status === 0) {
    gitFx = path.join(tmp, 'gitrepo');
    makeFixture(gitFx);
    write(gitFx, '.gitignore', 'docs/\n');
    const init = spawnSync('git', ['init', '-q'], { cwd: gitFx, encoding: 'utf8', windowsHide: true });
    if (init.status !== 0) gitFx = null;
  }
});

after(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test('--help prints usage and exits 0', () => {
  const r = run(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.out, /Usage: node \.agents\/scripts\/search\.mjs/);
});

test('regex match prints relative/path:line: text', () => {
  const r = run(['hello\\(', '--no-git']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.lines, ['src/app.ts:2: export function hello() {']);
});

test('skips ignored dirs, .agents/.state, binary files and files over 1 MB', () => {
  const r = run(['TODO', '--no-git']);
  assert.equal(r.code, 0, r.err);
  const files = new Set(r.lines.map((l) => l.split(':')[0]));
  assert.deepEqual([...files].sort(), ['docs/readme.md', 'src/app.ts', 'src/util.test.ts']);
});

test('-F treats the pattern literally', () => {
  const r = run(['-F', '$5 (a.b)', '--no-git']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.lines, ['docs/readme.md:2: Price: $5 (a.b)']);
});

test('-i ignores case; bundled grep flags like -rin are accepted', () => {
  assert.deepEqual(run(['hello world', '-i', '--no-git']).lines, ['src/deep/a.tsx:1: const A = () => <div>Hello World</div>;']);
  assert.equal(run(['-rin', 'hello world', '--no-git']).lines.length, 1);
});

test('-w matches whole words only', () => {
  const r = run(['-w', 'hit', '--no-git']);
  assert.equal(r.code, 1);
  assert.equal(run(['-w', 'hit3', '--no-git']).code, 0);
});

test('--glob: basename, negation, path globs and directory excludes', () => {
  const ts = run(['TODO', '--glob', '*.ts', '--no-git']);
  assert.deepEqual(ts.lines.map((l) => l.split(':')[0]).sort(), ['src/app.ts', 'src/util.test.ts']);
  const noTests = run(['TODO', '--glob', '*.ts', '--glob', '!*.test.ts', '--no-git']);
  assert.deepEqual(noTests.lines, ['src/app.ts:5: // TODO: fix']);
  const srcOnly = run(['TODO', '--glob', 'src/**', '--no-git']);
  assert.ok(srcOnly.lines.every((l) => l.startsWith('src/')), srcOnly.out);
  const noDocs = run(['TODO', '--glob', '!docs/**', '--no-git']);
  assert.ok(!noDocs.out.includes('docs/'), noDocs.out);
  const braces = run(['TODO', '-g', '*.{md,ts}', '--no-git']);
  assert.equal(braces.lines.length, 3);
});

test('-C prints context lines with "-" separators and "--" between groups', () => {
  const r = run(['hit', 'ctx.txt', '-C', '1', '--no-git']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.lines, [
    'ctx.txt-2- l2', 'ctx.txt:3: hit3', 'ctx.txt-4- l4', 'ctx.txt:5: hit5', 'ctx.txt-6- l6', '--',
    'ctx.txt-8- l8', 'ctx.txt:9: hit9', 'ctx.txt-10- l10',
  ]);
});

test('--files lists matching files once; without a pattern it lists files by glob', () => {
  const r = run(['TODO', '--files', '--no-git']);
  assert.deepEqual(r.lines.sort(), ['docs/readme.md', 'src/app.ts', 'src/util.test.ts']);
  const list = run(['--files', '--glob', '*.tsx', '--no-git']);
  assert.deepEqual(list.lines, ['src/deep/a.tsx']);
});

test('--max stops early and says so', () => {
  const r = run(['TODO', '--max', '2', '--no-git']);
  assert.equal(r.code, 0);
  assert.equal(r.lines.filter((l) => /^[^\[].*:\d+: /.test(l)).length, 2);
  assert.match(r.lines[r.lines.length - 1], /^\[search\] stopped after 2 matches/);
});

test('no match exits 1 with a message; bad regex and unknown option exit 2', () => {
  const none = run(['definitely_not_here_123', '--no-git']);
  assert.equal(none.code, 1);
  assert.match(none.out, /No matches/);
  const bad = run(['a(', '--no-git']);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /invalid regular expression/i);
  assert.equal(run(['x', '--bogus']).code, 2);
  assert.equal(run(['x', 'no/such/path']).code, 2);
});

test('end-of-line anchors work on CRLF files', () => {
  assert.deepEqual(run(['alpha end$', '--no-git']).lines, ['crlf.txt:1: alpha end']);
});

test('lines over 240 chars are clipped around the match', () => {
  const r = run(['NEEDLE', '--no-git']);
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0], /^long\.txt:1: \.\.\.x+NEEDLEy+\.\.\.$/);
  assert.ok(r.lines[0].length < 270, `length ${r.lines[0].length}`);
});

test('paths are relative to the current directory; path arguments scope the search', () => {
  assert.deepEqual(run(['TODO', 'src', '--glob', '!*.test.ts', '--no-git']).lines, ['src/app.ts:5: // TODO: fix']);
  assert.deepEqual(run(['return', '--no-git'], path.join(fx, 'src')).lines, ['app.ts:3:   return 42;']);
});

test('a path inside an ignored dir is searched; --no-ignore searches everything', () => {
  assert.deepEqual(run(['TODO', 'node_modules/pkg', '--no-git']).lines, ['node_modules/pkg/index.js:1: // TODO in node_modules']);
  const all = run(['TODO', '--no-ignore', '--no-git', '--files']);
  assert.ok(all.lines.includes('node_modules/pkg/index.js') && all.lines.includes('dist/out.js'), all.out);
});

test('a self-referencing directory junction/symlink does not loop forever (cycle guard)', () => {
  // End-to-end regression test for the reported failure mode: a directory reparse point
  // (loopbomb/a/parentlink -> loopbomb) that re-enters an ancestor. `fs.symlinkSync(..., 'junction')`
  // creates a real NTFS junction on Windows (no admin/Developer-Mode privilege needed, unlike a true
  // symlink) and degrades to an ordinary directory symlink elsewhere.
  // NOTE ON THE PLATFORM CLAIM: a prior review asserted that on Windows a junction is reported by both
  // `fs.Dirent.isSymbolicLink()` and `fs.lstatSync().isSymbolicLink()` as false (so the walker's
  // pre-existing "never follow symlinked directories" guard would not see it at all). Re-measured here
  // (Windows 11 10.0.26200, Node v25.6.0): a genuine `mklink /J` mount point (verified via
  // `fsutil reparsepoint query` -> Reparse Tag 0xa0000003 "Mount Point") and this `fs.symlinkSync(...,
  // 'junction')` link both report `isSymbolicLink() === true` from readdir's Dirent AND from
  // `fs.lstatSync()`, so that specific claim did not reproduce here — the existing symlink guard alone
  // already stops it. This test therefore guards the observable end-to-end contract ("never loop, find
  // the file exactly once") rather than one specific internal code path: it stays green whether that
  // protection comes from the symlink check or from the real-path/depth-cap guard added alongside it,
  // which is what matters if a future Node/libuv version ever reclassifies some reparse-point kind.
  const base = fs.mkdtempSync(path.join(TMP_BASE, 'search-junction-'));
  const root = path.join(base, 'loopbomb');
  const linkPath = path.join(root, 'a', 'parentlink');
  try {
    write(root, 'a/needle.txt', 'JUNCTION_NEEDLE_TOKEN\n');
    try {
      fs.symlinkSync(root, linkPath, 'junction'); // loopbomb/a/parentlink -> loopbomb (self cycle)
    } catch {
      return; // this environment can create neither junctions nor symlinks: nothing to test here
    }
    const r = run(['JUNCTION_NEEDLE_TOKEN', '--no-git'], root);
    assert.equal(r.code, 0, r.err);
    // Found exactly once via the real path, never again through the cyclic link.
    assert.deepEqual(r.lines, ['a/needle.txt:1: JUNCTION_NEEDLE_TOKEN']);
  } finally {
    // Remove the link itself (non-recursive) first so a recursive rmSync below can never be tempted
    // to walk back into the self-referencing loop while cleaning up.
    try { fs.rmdirSync(linkPath); } catch {}
    try { fs.unlinkSync(linkPath); } catch {}
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('a directory tree deeper than the hard depth cap stops cleanly instead of recursing forever', () => {
  // Exercises the walker's own MAX_WALK_DEPTH ceiling directly (independent of symlink/junction
  // detection): a file just inside the cap is found; a file just past it is silently excluded, and the
  // walk still finishes quickly rather than hanging or crashing on a pathologically deep tree.
  const base = fs.mkdtempSync(path.join(TMP_BASE, 'search-depth-'));
  try {
    let dir = base;
    for (let depth = 1; depth <= MAX_WALK_DEPTH + 1; depth++) {
      dir = path.join(dir, 'd');
      fs.mkdirSync(dir);
      if (depth === MAX_WALK_DEPTH) fs.writeFileSync(path.join(dir, 'inside.txt'), 'DEPTH_MARKER_TOKEN\n');
      if (depth === MAX_WALK_DEPTH + 1) fs.writeFileSync(path.join(dir, 'outside.txt'), 'DEPTH_MARKER_TOKEN\n');
    }
    const r = run(['DEPTH_MARKER_TOKEN', '--no-git'], base);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.lines.length, 1, r.out);
    assert.match(r.lines[0], /inside\.txt:1: DEPTH_MARKER_TOKEN$/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('git work tree: git grep path (untracked files, .gitignore, PCRE, CRLF, context, size limit)', { skip: !gitFx && 'git not available' }, () => {
  const todo = run(['TODO'], gitFx);
  assert.equal(todo.code, 0, todo.err);
  assert.deepEqual([...new Set(todo.lines.map((l) => l.split(':')[0]))].sort(), ['src/app.ts', 'src/util.test.ts']);
  assert.ok(todo.lines.includes('src/app.ts:5: // TODO: fix'));
  assert.deepEqual(run(['return \\d+;'], gitFx).lines, ['src/app.ts:3:   return 42;']);
  assert.deepEqual(run(['alpha end$'], gitFx).lines, ['crlf.txt:1: alpha end']);
  assert.deepEqual(run(['hit', 'ctx.txt', '-C', '1'], gitFx).lines.slice(0, 3), ['ctx.txt-2- l2', 'ctx.txt:3: hit3', 'ctx.txt-4- l4']);
  assert.deepEqual(run(['hit', '-C', '1'], gitFx).lines.slice(0, 3), ['ctx.txt-2- l2', 'ctx.txt:3: hit3', 'ctx.txt-4- l4']);
  assert.deepEqual(run(['TODO', '--files', '--glob', '!*.test.ts'], gitFx).lines, ['src/app.ts']);
  const capped = run(['hit', '--max', '1'], gitFx);
  assert.equal(capped.lines[0], 'ctx.txt:3: hit3');
  assert.match(capped.out, /stopped after 1 matches/);
  assert.deepEqual(run(['--files', '--glob', '*.tsx'], gitFx).lines, ['src/deep/a.tsx']);
  // A JS-only construct git -P rejects falls back to the walker with the same output format.
  assert.deepEqual(run(['\\u0048ello World'], gitFx).lines, ['src/deep/a.tsx:1: const A = () => <div>Hello World</div>;']);
});
