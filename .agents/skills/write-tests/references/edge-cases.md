# Edge-case catalogue and test smells

Pick from here when writing step 5 of `/write-tests`. Not every row applies to every function - pick the ones
that are reachable, and say why the rest are not ("no user input here, N/A").

## By input type
| Type | Edge cases to consider |
|---|---|
| String | empty `""`, whitespace-only, very long (10k+ chars), unicode/emoji/combining characters, mixed case, leading/trailing whitespace, injection-shaped (`"; DROP TABLE x;--"`, `<script>alert(1)</script>`), null byte |
| Number | `0`, negative, the type's min/max (e.g. `Number.MAX_SAFE_INTEGER`, `i32::MAX`, a DB column's precision), fractional where an integer is expected, `NaN`/`Infinity`/`-Infinity`, rounding at the exact boundary (`0.005` to 2 decimals) |
| Collection | empty `[]`, one item, duplicate items, unsorted input to a function that assumes sorted, very large N (perf cliff), nested/deeply recursive structures |
| Date / time | DST transition, leap day (Feb 29), leap second where relevant, month/year boundary, epoch 0, far future, a fixed timezone vs UTC, a date stored as a string in the wrong format |
| Optional / nullable | `null`, `undefined`/`None`/`nil`, a missing object key, the right key with the wrong type, an empty object where a populated one was expected |
| Concurrency | two callers acting at once, cancellation mid-operation, a partial failure (2 of 3 writes succeed), a retry after a timeout that actually succeeded server-side |
| I/O / network | timeout, connection refused, a 4xx vs a 5xx, a malformed or truncated response body, an empty body with a 200, a redirect |
| Files / paths | missing file, no read/write permission, a path with `..` (traversal), case-sensitivity differences across OS, a symlink, a path with spaces or unicode |
| Money / currency | negative amounts, a currency mismatch, rounding to the smallest unit (cents), a zero-amount transaction |
| Auth / permissions | expired or absent token, wrong role, a resource owned by someone else, a revoked session used after logout |

## Minimum per public function
At least one of: an empty/zero input, one boundary value, one invalid input, one error path - unless one
genuinely cannot occur for this function (say which, and why, in the report's "skipped" list).

## Test smells
| Smell | Why it is bad | Fix |
|---|---|---|
| `expect(result).toBeTruthy()` / `assert result` | Passes for almost any non-falsy value; does not pin the actual expected value | Assert the exact value: `toEqual({...})`, `assertSame(...)` |
| "does not throw" as the only assertion | A function that does nothing also "does not throw" | Also assert the resulting state or return value |
| Test name `test1`, `works`, `should work` | Does not say what broke when it fails | Name it as a behaviour sentence: `rejects a negative quantity` |
| Copy-pasted test bodies that differ by one literal | Drifts out of sync; easy to fix one copy and miss another | A parametrized table (`test.each`, `@pytest.mark.parametrize`, table-driven, `#[DataProvider]`) |
| Asserting on a mock's call count for the unit under test itself | Couples the test to implementation, not behaviour; breaks on any internal refactor | Assert observable output/state; mock only collaborators the unit does not own |
| A snapshot accepted without reading the diff | Silently locks in whatever the code currently does, bug included | Read the snapshot diff before `-u`/`--update-goldens`; a snapshot never doubles as the requirement |
| Shared mutable fixture/global between tests | Order-dependent failures, hard to reproduce alone | Fresh state per test (`beforeEach`, factories, `tmp_path`, `t.TempDir()`) |
| `sleep`/`waitForTimeout` to "wait for it to be ready" | Flaky under load, slow, still races on a slow CI runner | Wait on the real signal - see `flakiness.md` |
| Testing a private helper directly instead of the public behaviour it serves | Breaks on any internal refactor even when behaviour is unchanged | Test through the public surface; delete the helper test when you extract/inline |
| One test asserting five unrelated behaviours | A single failure is ambiguous about which behaviour broke | One behaviour per test; group related assertions about the *same* behaviour only |

## References
- Framework-specific parametrization, fakes, and fixtures: [frameworks.md](frameworks.md)
- Determinism causes and fixes: [flakiness.md](flakiness.md)
