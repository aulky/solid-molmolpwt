---
trigger: glob
globs: "**/*.sh,**/*.bash,**/*.zsh,**/Makefile,**/*.mk"
description: "Shell/Makefile quick card: strict mode, quoting, arrays, portability, invariants, idioms. Loaded when editing .sh/.bash/.zsh files or Makefiles."
---
# Shell / Make — quick card
Deep guide: `.agents/guides/languages/shell.md` — read it before non-trivial shell work (new script, portability across shells, concurrency, security-sensitive input).
Principles: `.agents/guides/principles/security.md`, `.agents/guides/principles/error-handling.md`, `.agents/guides/principles/testing-strategy.md`, `.agents/guides/principles/simplicity.md`.

## Toolchain (use the project's own config first)
- Lint: `shellcheck <file>` (or the project's file list) · Format: `shfmt -d <file>` (check), `shfmt -w <file>` (fix) · Test: `bats <dir>` if a `bats-core` suite exists
- No dedicated shell/Makefile stack in `verify.mjs` (`--only shell` errors `unknown stack`) — run the three commands above directly and note the gap in your Worker Report.
- Makefile has no formatter/linter of its own; `shellcheck` cannot read it — review recipe lines (the shell commands after each `\t`) as ordinary shell.
- Confirm the actual shell before assuming features: `bash --version` (need ≥ 4 for associative arrays, ≥ 4.3 for namerefs) vs `sh --version` (often `dash`/`busybox ash` on Linux, not bash).

## Invariants (MUST / NEVER — with reason → alternative)
1. MUST start every bash script with `set -euo pipefail` and `IFS=$'\n\t'` — without it, a failed command mid-script is silently ignored and word-splitting uses spaces. CAVEAT: `-e` does NOT fire inside `if cmd`, `cmd || true`, or `cmd &&` — check exit codes explicitly there instead of relying on it.
2. MUST quote every expansion: `"$var"`, `"${arr[@]}"`, `"$(cmd)"` — an unquoted expansion is split on `IFS` and glob-expanded, so `rm -rf $dir` deletes the wrong thing when `$dir` contains a space or `*`. NEVER leave an expansion bare unless you intentionally want splitting (rare; comment why).
3. MUST use `[[ ... ]]` for conditionals in bash/zsh (no word-splitting/globbing of unquoted operands, supports `=~`, `&&`); use POSIX `[ ... ]` only in a `#!/bin/sh` script, and quote every operand there — `[` word-splits.
4. NEVER build a temp path by hand (`/tmp/$$`, string concatenation) — it races with other processes and other invocations. Instead `tmp=$(mktemp -d)` and immediately `trap 'rm -rf -- "$tmp"' EXIT` (add `INT TERM` too if the script traps them elsewhere).
5. NEVER `eval` a string built from user input, an argument, or a file — it runs arbitrary code (command injection). Build an array of arguments and pass it to a command instead: `args=(--flag "$val"); cmd "${args[@]}"`.
6. NEVER parse `ls` output to iterate files — filenames may contain spaces/newlines and break word-splitting. Instead use a glob (`for f in ./*.log`) or `find . -print0 | while IFS= read -r -d '' f; do ...`.
7. MUST use `$(...)` for command substitution, never backticks — backticks nest awkwardly and mis-handle escaping; `$(...)` is POSIX and nests cleanly.
8. MUST write recipe lines in a Makefile indented with a literal TAB, never spaces — make reports `missing separator` (or silently misparses) otherwise; MUST mark every non-file target `.PHONY` (`clean`, `test`, `build`, ...) or make skips the recipe once a same-named file exists.

## Idioms & pitfalls Flash models get wrong
- `set -u` errors on unset variables, but `$1`/`$2` for missing optional args also count as unset — use `"${1:-}"` for an optional positional; check `$#` before a required one.
- `local x; x=$(cmd)` on one line swallows `cmd`'s exit status (the status of `local` wins). Split it: `local x; x=$(cmd) || return 1`.
- `pipefail` makes a pipeline fail if *any* stage fails, not just the last — so `false | true` now fails under `set -e`. Expected, but surprising if unintended.
- Reading a file line-by-line: `while IFS= read -r line; do ...; done < file` — without `IFS=` whitespace is trimmed; without `-r` backslashes are eaten.
- Arrays hold argument lists; never store a command line in a plain string and re-split it. Build `cmd=(rsync -av "$src" "$dst")`, run `"${cmd[@]}"`.
- `#!/bin/sh` is not bash: no arrays, no `[[ ]]`, no `${var,,}`/`${var^^}`, no `<<<`. Running a bash script via `sh script.sh` reparses it as POSIX sh regardless of the shebang — a bashism fails at runtime, not lint time (shellcheck catches most with `-s sh`).
- macOS ships BSD `sed`/`date`, Linux ships GNU: `sed -i ''` (BSD) vs `sed -i` (GNU); `date -v+1d` (BSD) vs `date -d '+1 day'` (GNU). Do not assume GNU flags on a script that must also run on macOS.
- `cd /some/dir` can fail silently otherwise: `cd /some/dir || exit 1`.
- Makefile: `VAR := val` (eager, once) vs `VAR = val` (lazy, re-evaluated) — prefer `:=`. `$@`/`$<`/`$^` are target/first prereq/all prereqs.

## Example — bad → good
```sh
files=`ls *.log`
for f in $files; do
  cp $f /tmp/bak/$f
done
```
```bash
#!/usr/bin/env bash
set -euo pipefail
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
for f in ./*.log; do
  cp -- "$f" "$tmp/"
done
```

## Before finishing
- [ ] `shellcheck` clean (or documented `# shellcheck disable=SCxxxx — reason`) · [ ] `shfmt -d` empty · [ ] every expansion quoted, no bare `eval` of external input · [ ] temp files via `mktemp` + `trap ... EXIT` · [ ] Makefile recipes use tabs and every non-file target is `.PHONY`
