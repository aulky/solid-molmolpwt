# Failure triage: signatures → cause → fix

How to use this file:
1. Find the first error line in the FAIL block.
2. Match it against the tables below.
3. Confirm the cause by viewing the cited `path:line` before you edit.

These are patterns, not proof. Read the actual output.

## 1. Any stack: environment and tooling
| Signature | Cause | Action |
|---|---|---|
| `is not recognized as an internal or external command`, `command not found`, exit 127, `ENOENT` spawning a tool | The tool is not installed or not on PATH | Environment issue. Try the project-local binary (`bunx`, `npx`, `vendor/bin/`, `uv run`). Never install tools; worker: report BLOCKED with the install command |
| `EADDRINUSE`, `address already in use` | A dev server or earlier test run still holds the port | Stop it only if you started it (`manage_task` `Action: "kill"`), then rerun. Otherwise report BLOCKED with `Setup needed: stop the process on port <n>`, because it may be another worker's server |
| `EPERM`, `EBUSY`, `resource busy or locked` (Windows) | A watcher, dev server or editor holds the file | Stop watchers and dev servers only if you started them, then rerun; otherwise report BLOCKED with `Setup needed: stop <process>`. Never delete lockfiles to "fix" it |
| `ETIMEDOUT`, `ECONNRESET`, `getaddrinfo`, registry 5xx | Network or registry problem | Transient: retry once. If it persists, report it. Do not change dependency versions to route around it |
| `JavaScript heap out of memory`, exit 137 | Memory limit | Run the failing step alone, then report it. Do not disable the step |
| Step hangs until `--timeout` | A watch mode, an interactive prompt, or a report opening in a browser | Use the non-watch command (`vitest run`, `--reporter=list`, `CI=1` style flags) |
| Passes when rerun alone, fails in the full run | Shared state or order dependence (a flaky test) | Report it as flaky with both outputs. Look for shared globals, time or randomness. Never add retries to hide it |

## 2. Node / TypeScript / Bun
| Signature | Cause | Action |
|---|---|---|
| `TS2307: Cannot find module 'x'` | Wrong import path or alias, or a missing dependency or types | Check `tsconfig.json` `paths` (e.g. `~/*` → `./src/*`; aliases are listed in root `AGENTS.md`) and `package.json` deps |
| `TS2322` / `TS2345` (type not assignable) | A real type mismatch | Fix the value or the signature. Never cast through `any` or `as unknown as` |
| `TS2339: Property 'x' does not exist` | Wrong type or a typo | Narrow the type (a type guard) or fix the name |
| `TS18048` / `TS2532` (possibly undefined) | A missing null check under `strict` | Handle the undefined case explicitly |
| `TS7006: Parameter implicitly has an 'any' type` | Missing annotation | Add the precise type |
| `ERR_MODULE_NOT_FOUND`, `Cannot use import statement outside a module`, `require is not defined in ES module scope` | ESM/CJS mismatch. Here `"type": "module"` makes `.js` files ESM | Use `import` and the file extensions Node expects. Use `.cjs` for CommonJS |
| Biome / ESLint rule id (e.g. `lint/correctness/...`, `no-unused-vars`) | A lint violation | Fix the code. Run the formatter's write mode on your files for format-only diffs |
| Vitest `AssertionError: expected ... to ...` | A behaviour differs from the expectation | Decide whether the code or the requirement changed. Fix the code unless the task changed the behaviour (worker: only inside OWNED FILES; otherwise `OUT OF SCOPE:`) |
| `Test timed out in 5000ms` | A promise that never resolves, a missing `await`, or real timers | Add the missing `await`, or use fake timers. Do not simply raise the timeout |
| `error: Script not found "x"` (bun) | The script is missing from `package.json` | Use `--list` to see what verify runs. Do not invent scripts in the report |
| Playwright failures | See `.agents/skills/e2e-test/SKILL.md`, step 7 | |

## 3. Rust
| Signature | Cause | Action |
|---|---|---|
| `cargo fmt --check` prints a diff | Formatting | `cargo fmt`. If the diff includes files you did not touch, report them rather than reformat them |
| `error[E0308]: mismatched types` | A type error | Fix the type. Avoid `as` casts that truncate |
| `error[E0382]: borrow of moved value` | Ownership moved | Borrow (`&x`), clone deliberately, or restructure |
| `error[E0502]` / `E0499` (conflicting borrows) | A mutable and a shared borrow overlap | Shorten the borrow scope, or split the data |
| `clippy` `-D warnings` lint names (`clippy::needless_borrow`, ...) | A lint treated as an error | Apply the suggestion. Use `#[allow]` only with a comment explaining why the lint is wrong here |
| `test ... FAILED` + `panicked at` | Assertion or `unwrap` on `None`/`Err` | Read the panic location. Replace the `unwrap` with error handling if the input can fail |

## 4. Go
| Signature | Cause | Action |
|---|---|---|
| `gofmt -l .` lists files | Formatting | `gofmt -w <listed files>` |
| `declared and not used`, `imported and not used` | Compile errors in Go | Remove the item or use it |
| `go vet`: `printf`, `copylocks`, `loopclosure` | Suspicious code | Fix it as vet suggests |
| `--- FAIL: TestX` | Test failure | Run `go test ./pkg -run TestX -v`. Use `-race` if concurrency is involved |

## 5. Python
| Signature | Cause | Action |
|---|---|---|
| `ruff check` codes (`F401` unused import, `E711`, `B006`, ...) | Lint | Fix it, or `ruff check --fix <files>` for safe fixes |
| `ruff format --check`: `Would reformat: x.py` | Formatting | `ruff format <files>` |
| `mypy`: `error: Incompatible types`, `has no attribute` | Types | Fix the annotation or the code. Never add `# type: ignore` without a reason |
| `ModuleNotFoundError` in pytest | Wrong interpreter or venv | Run through the project runner (`uv run pytest`, `poetry run`, the `.venv` python). On this machine use `python`, not `python3` |
| `fixture 'x' not found` | A missing `conftest.py` or plugin | Check where conftest lives and which plugins are installed |

## 6. PHP / Laravel
| Signature | Cause | Action |
|---|---|---|
| `pint --test` lists files | Formatting | `vendor/bin/pint <files>` |
| `phpstan`: `Call to an undefined method`, `expects X, Y given` | Static analysis | Fix the types. Use baseline entries only with approval |
| Pest / PHPUnit `Failed asserting that ...` | Test failure | Read the diff. Check `.env.testing` and the DB refresh traits |
| `composer validate` errors | Invalid `composer.json` | Fix the manifest. Never edit `composer.lock` by hand |

## 7. JVM / .NET / Ruby / others
| Signature | Cause | Action |
|---|---|---|
| Maven `BUILD FAILURE` + `cannot find symbol` | A compile error or missing import/dependency | Read the first `[ERROR]` line with its file:line |
| Gradle `Execution failed for task ':x:test'` | Test or check failure | Open `build/reports/tests/test/index.html` or rerun `--tests <Name>` for the text output |
| `CS0246: type or namespace could not be found` | Missing `using` or reference | Add the using or project reference |
| `CS8602` (possible null dereference) as an error | Nullable warnings treated as errors | Handle null. Do not use `!` without proof |
| RuboCop offenses | Style or lint | `bundle exec rubocop -a <files>` (safe autocorrect only) |
| `mix format --check-formatted` fails | Formatting | `mix format <files>` |
| `dart analyze` / `flutter analyze` issues | Lints and types | Fix them. Run `dart format <files>` for formatting |
| CTest failures | C/C++ tests | Run `ctest --test-dir <dir> -R <name> --output-on-failure` |

## 8. agent-kit step (this kit)
| Signature | Cause | Action |
|---|---|---|
| `doctor` ERROR: frontmatter or trigger | A rule without valid frontmatter, which Antigravity ignores silently | Fix the frontmatter. See `/workspace-doctor` |
| `doctor` ERROR: glob has a directory part | Globs match basenames only | Rewrite the pattern as `**/<basename-glob>` |
| `doctor` size or budget ERROR/WARN | An always-on file or `90-lessons.md` is over its cap | Prune (see `/reflect`, step 6) |
| `node --test` failure in `.agents/hooks/test` or `.agents/scripts/test` | A kit script regression | Read the failing test name and run `node --test <file>` directly |
