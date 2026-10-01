# Shell & Make — engineering guide
> Scope: POSIX `sh`/`dash`, bash, and GNU Make, as used for build scripts, CI glue, dev tooling and Makefiles. Not zsh-as-interactive-shell config. Quick card: `.agents/rules/lang-shell.md`.
> Last verified: 2026-09 — GNU Bash manual and bash-announce list (bash 5.3 released 2025-07-05, current stable; confirmed via lists.gnu.org/archive/html/bash-announce/2025-07/msg00000.html) and `bash --version` (5.2.37, this machine — Git Bash/MSYS2 bundles 5.2, not 5.3; treat 5.3-only features as unavailable here until confirmed); ShellCheck (latest tagged release v0.11.0, 2025-08-04, github.com/koalaman/shellcheck/releases) and shfmt (mvdan/sh, actively released through 2026 — confirm the installed version with `shfmt --version`); POSIX.1-2024 Shell & Utilities volume (pubs.opengroup.org); GNU Make manual (gnu.org/software/make/manual). Every script below was checked against bash 5.2/5.3 semantics; run them through `shellcheck`/`shfmt` locally since this environment has neither installed.

## 1. Mental model / philosophy
- Shell is glue, not an application language: invoke other programs, wire their exit codes and streams together. Once a script needs real data structures or non-trivial control flow, call a Python/Node/Go tool from a thin shell wrapper instead of growing the shell script.
- Two dialects, pick deliberately: **POSIX `sh`** (portable — `dash`, `busybox ash`, `bash --posix`, `ksh`) for anything shipping to unknown environments (install scripts, Docker `ENTRYPOINT`, Alpine images); **bash** (arrays, `[[ ]]`, process substitution) for CI jobs, dev scripts and Makefiles where you control the interpreter via `#!/usr/bin/env bash`. Never mix: a `#!/bin/sh` script that uses bash-only syntax breaks the moment someone runs `sh script.sh` (shebang ignored) or `/bin/sh` is `dash`, not bash.
- Treat a script as a program: validate arguments, fail loudly and early, put error messages on stderr, use exit codes consistently (`0` success, `1` general failure, `2` usage error, `126`/`127` reserved for "not executable"/"not found").
- Idempotency and safety first: a script that copies, deletes or deploys should be safe to re-run, and never act on attacker- or user-controlled data without quoting and validation.
- Small, composable functions beat one long body — same as any language. `set -euo pipefail` + functions + `trap` cleanup is shell's equivalent of exceptions + RAII.

## 2. Project structure & tooling
Common layout for a repo's scripts:
```text
scripts/            # entry points, one purpose each, executable (chmod +x), short
  build.sh
  release.sh
  lib/
    common.sh        # sourced helpers: log(), die(), require_cmd() — no side effects on source
Makefile             # thin orchestration: `make build` calls scripts/build.sh
```
- Shebang: `#!/usr/bin/env bash` (portable — finds bash on `$PATH`, works when bash isn't at `/bin/bash`, e.g. some BSDs/Nix) for bash scripts; `#!/bin/sh` for scripts that must run under the system's minimal shell. Never `#!/bin/bash` if the script might run on a system where bash lives elsewhere.
- Make the file executable (`chmod +x script.sh` on POSIX; on Windows under Git Bash `git update-index --chmod=+x script.sh` so the bit survives `git clone` on Linux/macOS CI).
- Confirm which shell you're targeting before using a feature: `bash --version`, and separately `sh --version` or `readlink -f "$(command -v sh)"` — on Debian/Ubuntu `/bin/sh` is `dash`; on Alpine it's `busybox ash`; both reject bash-only syntax.

Toolchain — install once per machine, run on every change:

| Task | Command | Notes |
|---|---|---|
| Lint | `shellcheck script.sh` | Static analysis: quoting bugs, unreachable code, unsafe patterns. Exit non-zero on any finding by default. |
| Lint (targeted dialect) | `shellcheck -s sh script.sh` / `-s bash` | Force POSIX-`sh` rules on a `#!/bin/sh` script instead of auto-detecting from the shebang. |
| Lint (source following) | `shellcheck -x script.sh` | Follow `source`/`.` into other files instead of skipping them (`SC1091`). |
| Format (check / fix) | `shfmt -d script.sh` / `shfmt -w script.sh` | `-i 2` (2-space indent), `-ci` (indent case bodies), `-bn` (binary ops at line start) are common project conventions — read `.editorconfig` first. |
| Test | `bats test/*.bats` | bats-core; see §5. |
| Everything | *(none — see below)* | There is no dedicated shell/Makefile stack in `verify.mjs`; `--only shell` exits with `unknown stack "shell"`. Run `shellcheck`, `shfmt -d` and `bats` directly (table above) and say so in your Worker Report. |
| Trace execution | `bash -x script.sh` or `set -x` inside | Prints each command before running it; set `PS4='+ ${BASH_SOURCE}:${LINENO}: '` for file:line context. |
| Syntax-only check | `bash -n script.sh` | Parses without executing — fast pre-flight, catches typos but not logic bugs. |

- Install: `shellcheck`/`shfmt` ship as static binaries (`apt install shellcheck`, `brew install shellcheck shfmt`, or a release-page download) — no runtime dependency once installed. `bats-core`: `npm install -g bats` or clone `bats-core/bats-core` and run `install.sh`.
- CI: run `shellcheck` and `shfmt -d` on every touched script, before `bats` — both are sub-second per file, never skip them for speed.

## 3. Core idioms
**Strict mode and what it actually catches**
```bash
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'
```
- `-e` (errexit): stop on the first command that returns non-zero. Does **not** apply inside `if cond; then`, `while cond; do`, `cond && x`, `cond || x`, or a function's last command called in one of those contexts. Check `$?` or use `|| die "..."` explicitly there.
- `-u` (nounset): reading an unset variable is an error. `${1:-default}` / `${VAR:-}` opt back into "unset is fine here". Positional params past `$#` count as unset.
- `-o pipefail`: a pipeline's exit status is the rightmost failing command, instead of bash's default (only the last command's status) — so `grep pattern file | sort` doesn't hide a failing `grep`.
- `IFS=$'\n\t'` narrows word-splitting to newlines/tabs — reduces accidental splitting of a forgotten unquoted `$var`, but is defense in depth, not a substitute for quoting.
- None of this replaces checking exit codes you must react to specifically (`if ! cmd; then ...; fi` still works under `-e`).

**Quoting** — the single highest-value habit:
```bash
name="$1"                 # quote assignments from expansions
files=("$@")               # "$@" (quoted) preserves each arg as one word; $* does not
printf '%s\n' "${files[@]}"
[[ -n "$name" ]] && echo "hi, $name"
```
Unquoted `$var` undergoes word-splitting (on `$IFS`) then pathname expansion (globbing); `"$var"` undergoes neither. Wanting splitting is rare and almost never correct — quote by default and justify any exception with a comment.

**Arrays** (bash/ksh/zsh; not POSIX `sh`):
```bash
declare -a paths=()
paths+=("$dir/one.txt" "$dir/two.txt")
for p in "${paths[@]}"; do [[ -f "$p" ]] || die "missing: $p"; done
echo "${#paths[@]} files"                   # length
declare -A seen=()                          # associative array (bash ≥ 4)
seen["$key"]=1
[[ -n "${seen[$key]:-}" ]] && echo "dup"
```
Use arrays for any list of arguments or filenames you build up and later pass to a command — never a space-joined string you re-split later.

**`[[ ... ]]` vs `[ ... ]` vs `(( ... ))`**
- `[[ ... ]]` (bash/ksh/zsh keyword): no word-splitting/globbing on unquoted operands, `&&`/`||`/`<`/`>` work without escaping, `=~` for regex, `==` supports glob patterns. Prefer this in any bash script.
- `[ ... ]` (POSIX, `test` builtin): required in `#!/bin/sh` scripts; quote every operand (`[ "$x" = "$y" ]`), use `=` not `==` (POSIX only guarantees `=`), and `&&`/`||` between separate `[ ]` calls, not inside one.
- `(( ... ))` (bash/ksh arithmetic): use for integer math and comparisons (`(( count > 0 ))`); `$(( ... ))` is POSIX and works in `sh` too.

**Functions, locals, and getopts**
```bash
usage() { printf 'usage: %s [-v] -o OUTPUT FILE\n' "${0##*/}" >&2; exit 2; }

main() {
  local verbose=0 output=""
  while getopts ":vo:" opt; do
    case "$opt" in
      v) verbose=1 ;;
      o) output="$OPTARG" ;;
      :) echo "option -$OPTARG requires an argument" >&2; usage ;;
      \?) echo "unknown option -$OPTARG" >&2; usage ;;
    esac
  done
  shift $((OPTIND - 1))
  [[ $# -ge 1 ]] || usage
  local input="$1"
  ((verbose)) && echo "processing $input -> $output" >&2
  # ...
}
main "$@"
```
- `local` scopes a variable to the function — declare every function-local variable with it, or it leaks into (or clobbers) the caller's scope.
- `getopts` handles combined short flags (`-vo out`) and `--` correctly; a hand-rolled `while [[ "$1" == -* ]]; do case $1 in ...` loop for long options (`--output`) is fine too, but always support `--` to end option parsing so a filename like `-rf` isn't parsed as a flag.
- `${0##*/}` strips the directory from `$0` — avoids forking `basename` for something this cheap.

**Here-docs and parameter expansion**
```bash
cat <<EOF > "$out"
name: $name
count: ${count:-0}
EOF
: "${LOG_LEVEL:=info}"     # default-and-assign
echo "${path%/*}"          # dirname-equivalent, no fork
echo "${path##*/}"          # basename-equivalent, no fork
```
Quote the heredoc delimiter (`<<'EOF'`) to suppress expansion when you want literal text (e.g. writing a script that itself contains `$`).

## 4. Error handling
1. Strict mode (§3) catches the common classes; layer an explicit trap for anything else:
```bash
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
on_err() { local ec=$?; echo "failed at line ${BASH_LINENO[0]} (exit $ec): ${BASH_COMMAND}" >&2; }
trap on_err ERR
trap 'rm -rf -- "$tmp"' EXIT
```
- `ERR` trap fires wherever `-e` would have exited (same exceptions apply). `EXIT` trap always fires (normal exit, `exit`, or an uncaught error) — put cleanup there, not in `ERR`, and don't duplicate it at every `exit` call site.
2. Distinguish "can't happen, bug" (let `-e`/`ERR` kill the script; the message names the file:line) from "expected failure the caller should see" (a clear message via `die`, and a specific exit code the caller can branch on).
3. Check the exit status of anything assigned from a command substitution — `-e` does not always fire there:
```bash
if ! out=$(some_cmd 2>&1); then
  die "some_cmd failed: $out"
fi
```
4. With `pipefail`, a pipeline's status is the rightmost failure; without it, only the last stage's status survives. Use `${PIPESTATUS[0]}` (bash) to react to one specific stage's failure instead of restructuring around a pipe.
5. Never silence an error with `2>/dev/null` or `|| true` as a first response — add it only after deciding the failure is genuinely fine, with a comment saying why.

## 5. Testing
- **bats-core** (Bash Automated Testing System) is the standard unit-test framework for shell functions/scripts. A test file is `*.bats`, run with `bats path/to/file.bats` or a directory.
```bash
#!/usr/bin/env bats

setup() {
  load 'test_helper/common'   # shared helpers, if any
  export TMP_DIR="$(mktemp -d)"
}
teardown() {
  rm -rf -- "$TMP_DIR"
}

@test "usage() exits 2 with no args" {
  run ./script.sh
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage:"* ]]
}

@test "processes a file and writes output" {
  echo "hello" > "$TMP_DIR/in.txt"
  run ./script.sh -o "$TMP_DIR/out.txt" "$TMP_DIR/in.txt"
  [ "$status" -eq 0 ]
  [ -f "$TMP_DIR/out.txt" ]
}
```
- `run` captures `$status` and `$output` (and `$lines[]` per line) without letting a failure abort the whole test file, even under the script's own `set -e`.
- Mock an external command by prepending a directory with a same-named fake to `$PATH` in `setup()`; restore it in `teardown()`. Avoid mocking so much the test stops exercising real behavior.
- Keep scripts testable by extracting logic into functions and guarding `main` so `bats` can call functions directly instead of only shelling out: `if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then main "$@"; fi`.
- `shellcheck` and `shfmt -d` are cheap, deterministic tests too — run them before `bats`, not as an afterthought.
- For Make targets, `make -n target` (dry run, prints the recipe without executing) is a cheap smoke test for wrong dependencies/typos in `$(...)`.

## 6. Performance
- Avoid forking a process per line/iteration. `while read -r line; do echo "$line" | tr 'a-z' 'A-Z'; done < file` forks `tr` once per line; `tr 'a-z' 'A-Z' < file` does the whole file in one process. Prefer parameter expansion (`${var^^}`/`${var,,}`, bash ≥ 4) over spawning `sed`/`awk`/`tr` inside a loop.
- Useless Use of Cat (UUOC): `cat file | grep pattern` forks `cat` for nothing — `grep pattern file`. Same for `cat file | wc -l` → `wc -l < file`.
- Prefer the `read` builtin, parameter expansion and glob patterns over external `sed`/`awk`/`cut` for small transformations; reach for `awk`/`sed` only for genuine multi-field/regex text-processing.
- Parallelize independent work: `printf '%s\n' "${items[@]}" | xargs -P "$(nproc)" -n1 cmd` (or GNU `parallel` if already a dependency). `nproc` is GNU/Linux-only — on macOS/BSD use `sysctl -n hw.ncpu` or the POSIX `getconf _NPROCESSORS_ONLN`. Always cap concurrency and confirm the downstream command is safe to run concurrently.
- `$(cmd)` forks a subshell — cheap once, expensive in a hot loop run thousands of times; hoist it out when the value doesn't change per iteration.
- Makefile: avoid `$(shell find . -name '*.c')` re-running on every parse for large trees — prefer a pattern rule or a variable computed once. Recursive `make -C subdir` loses cross-directory dependency tracking; prefer one top-level Makefile with `include` for large projects.

## 7. Security
- **Never `eval` untrusted input** — arguments, file contents, environment variables, or anything derived from them. `eval "$user_input"` is arbitrary code execution. For dynamic variable names, use a `declare -n` nameref (bash ≥ 4.3) or an associative array instead.
- **Never pipe a download straight into a shell**: `curl https://example.com/install.sh | bash` runs whatever the server returns, unreviewed, and can behave differently under a partial download or MITM. Download to a file, verify a checksum/signature, inspect it, then run it.
- Quote everything (§3) — the #1 injection vector in shell is an unquoted expansion reaching a command that interprets it (`rm -rf $dir` with `dir=". -x"` or a path containing spaces).
- Prefer arrays over string concatenation when building a local command. **`ssh` is a special case**: the client joins every trailing argument into one string with plain spaces (no re-quoting) and hands that whole string to the remote shell for a *second* parse — so local quoting only stops local word-splitting, it does nothing to stop the remote shell from re-interpreting `;`, `$( )`, etc. inside the value:
```bash
# bad: local interpolation reaches the shell twice (locally, then remotely)
ssh "$host" "ls $user_dir"
# still bad: ssh flattens "ls" and "$user_dir" into one space-joined string
# before the remote shell sees it, so this is exactly as injectable as above
ssh "$host" -- ls "$user_dir"
# good: quote the value FOR THE REMOTE SHELL yourself, then pass the
# already-quoted string as a single local argument (nothing left for ssh to join)
remote_cmd=$(printf 'ls -- %q' "$user_dir")
ssh "$host" -- "$remote_cmd"
```
- Validate paths before file operations (reject `..`/absolute-path traversal in externally-supplied filenames), and put `--` before a filename argument to any command that also accepts flags (`rm -- "$file"`) so `-rf`-as-filename isn't parsed as an option.
- `mktemp` creates a file atomically with mode `0600` — never hand-build a "unique" name (`/tmp/app-$$`) and write to it after; that's a TOCTOU race and a predictable-name attack. `trap 'rm -rf -- "$tmp"' EXIT` immediately after creating it.
- Don't put secrets in command-line arguments (visible via `ps`/`/proc/<pid>/cmdline`) or in a script's own text (visible in `git log`/shell history). Read them from env vars set by a secret manager or a restricted-permission file; never `echo`/log them.
- `set -x`/`bash -x` prints every expanded command, including secrets in variables — `set +x` around any block touching credentials.
- Don't trust an inherited `$PATH` in a security-sensitive script — set it explicitly, or call binaries by absolute path / a `command -v` check made once at the top.

## 8. Concurrency
- Background a job with `cmd &`, collect its PID with `pid=$!`, wait for it with `wait "$pid"` (or plain `wait` for all children). `wait -n` (bash ≥ 4.3) returns as soon as any one background job finishes — useful for a worker pool.
```bash
pids=()
for url in "${urls[@]}"; do
  fetch "$url" & pids+=("$!")
done
status=0
for pid in "${pids[@]}"; do
  wait "$pid" || status=1
done
exit "$status"
```
- Cap concurrency explicitly (a counting loop, `xargs -P`, or GNU `parallel`) — an unbounded `for x in "${big_list[@]}"; do cmd & done` can exhaust process/file-descriptor limits.
- Two invocations racing on the same resource (lock file, shared log, deploy target) need real locking, not a check-then-act on a file's existence — `flock` a lock file for the critical section:
```bash
exec 9>/var/lock/myapp.lock
flock -n 9 || die "another instance is running"
# ... critical section ...
```
  (`flock -n` fails fast instead of blocking; drop `-n` to queue.)
- `mktemp` is already safe against concurrent invocations (atomic `O_EXCL` creation) — prefer it over any home-rolled "does this name exist" check, which is a race.
- `trap 'cleanup' INT TERM` so a job killed mid-run (Ctrl-C, CI timeout, `kill`) still cleans up; combine with the `EXIT` trap (§4) so graceful and signaled exits both clean up the same way.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `for f in $(ls *.txt)` | breaks on spaces/newlines in names; parses `ls` output | `for f in ./*.txt` |
| `rm -rf $dir` (unquoted) | word-splits/globs; deletes the wrong path | `rm -rf -- "$dir"` |
| `` cmd=`other_cmd` `` (backticks) | awkward nesting/escaping | `cmd=$(other_cmd)` |
| `eval "$input"` | arbitrary code execution | array-based command construction; `declare -n` for indirection |
| `curl url \| bash` | runs unreviewed, unverified code | download, checksum/inspect, then run |
| `cat file \| grep x` | forks a needless process | `grep x file` |
| `[ $a == $b ]` in a `#!/bin/sh` script | `==` and unquoted operands are bash-only/unsafe in POSIX `[` | `[ "$a" = "$b" ]`, or `[[ ]]` if truly bash |
| home-rolled temp path (`/tmp/x.$$`) | race, predictable name | `mktemp` / `mktemp -d` + `trap ... EXIT` |
| script assumes `set -e` covers everything | silently continues past a failure inside `if`/`&&`/pipelines without `pipefail` | check `$?` / use `pipefail` / explicit `|| die` |
| Makefile recipe indented with spaces | `make: *** missing separator` (or silent breakage) | re-indent with a literal tab |
| Makefile target without `.PHONY` | skipped once a same-named file/dir exists | `.PHONY: clean test build ...` |
| bash-only syntax in a `#!/bin/sh` script | breaks under `dash`/`ash`, or when run as `sh script.sh` | use POSIX syntax, or change the shebang to bash and require it |
| unbounded `cmd &` in a loop | exhausts processes/FDs; no way to collect failures | cap concurrency; collect PIDs; `wait` each and check status |

## 10. Review checklist
- [ ] Every bash script has `#!/usr/bin/env bash` + `set -euo pipefail`; every POSIX script has `#!/bin/sh` and avoids bash-only syntax (arrays, `[[ ]]`, `${var,,}`, `<<<`)
- [ ] Every variable/command-substitution/array expansion is quoted, except a documented, deliberate case
- [ ] No `eval` on anything derived from input, arguments, files or environment variables; no `curl | bash`
- [ ] Every temp file/dir comes from `mktemp`/`mktemp -d`, cleaned up by a `trap ... EXIT` (and `INT TERM` if long-running)
- [ ] No `ls` parsing; file lists come from globs or `find ... -print0` / `read -r -d ''`
- [ ] `shellcheck` runs clean (documented `# shellcheck disable=SCxxxx — reason` for any suppression); `shfmt -d` is empty
- [ ] Exit codes are meaningful and checked where the caller needs to branch on them; errors go to stderr, not stdout
- [ ] Concurrency (background jobs, shared files) has explicit `wait`/status collection and, if needed, `flock`
- [ ] Makefile recipes use real tabs; every non-file target is listed in `.PHONY`; `:=` used unless lazy expansion is intentional
- [ ] A `bats` test (or equivalent) exists for new script behavior, especially argument parsing and error paths

## 11. References
- Bash manual (5.3, 2025-05-18): https://www.gnu.org/software/bash/manual/bash.html
- Bash changelog / release notes: https://tiswww.case.edu/php/chet/bash/CHANGES
- POSIX.1-2024 Shell & Utilities (`sh` grammar, `test`, utilities): https://pubs.opengroup.org/onlinepubs/9799919799/
- ShellCheck wiki (every SC code explained with fix): https://www.shellcheck.net/wiki/
- shfmt (mvdan/sh): https://github.com/mvdan/sh
- bats-core: https://bats-core.readthedocs.io/ and https://github.com/bats-core/bats-core
- GNU Make manual: https://www.gnu.org/software/make/manual/make.html
- Google Shell Style Guide: https://google.github.io/styleguide/shellguide.html
- `mktemp`, `flock`, `getopts` man pages (GNU coreutils / util-linux / bash builtins) for the exact flags on your platform
- Kit principles: `.agents/guides/principles/security.md`, `.agents/guides/principles/error-handling.md`, `.agents/guides/principles/testing-strategy.md`, `.agents/guides/principles/simplicity.md`
