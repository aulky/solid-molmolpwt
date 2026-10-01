# Flakiness: causes and the deterministic fix

A flaky test is not a fast test with bad luck - it depends on something the test does not control. Find which
row applies with `node .agents/skills/write-tests/scripts/repeat-run.mjs --times 10` (or `--until-fail` to
bisect), then apply the fix. Never paper over a flake with a sleep, a retry, or `--repeat` in CI config.

| Cause | Signal | Deterministic fix |
|---|---|---|
| Real wall-clock time | Fails near midnight, month-end, or only in one timezone | Inject a clock/`TimeProvider`, or fake time: `vi.useFakeTimers()` + `vi.setSystemTime(...)`, `freezegun`/`time-machine`, `Clock.fixed(...)`, `travel_to(...)`, `#[tokio::test(start_paused = true)]` |
| Real network / external service | Fails offline, slow, or when the third party has an incident | Mock or fake the boundary (`page.route().fulfill()`, `Http::fake()`, `httptest.NewServer`, a hand-written fake behind a trait/interface); never hit a live third-party API in a test |
| Unseeded randomness | Different failure each run, disappears when you rerun | Inject or seed the RNG; assert on the property that must hold for every seed, or fix the seed and assert the exact output |
| Order dependence / shared mutable state | Passes alone, fails in the full suite (or vice versa) | Fresh state per test (`beforeEach`, factories, `t.TempDir()`, `tmp_path`); run the suite with random order on to catch this (`--sequence.shuffle`, `pytest-randomly`, `-shuffle=on`, `--order random`, `--seed 0` to reproduce) |
| Missing `await` / async race | Assertion runs before the awaited effect lands; intermittent, worse under load | `await` every promise; assert with a polling helper on the real signal (`vi.waitFor`, `await expect(locator)...`, `waitFor` from testing-library) - never a fixed sleep |
| Two tests fighting over a resource | Fails only with parallel workers, or "address already in use" | A fresh port/temp dir/DB schema per test or per worker; do not hardcode ports or shared file paths |
| Test order coupling via global config or env vars | Fails when run in a different order or file subset | `t.Setenv`/`monkeypatch.setenv` scoped to the test, restored automatically; never mutate `process.env`/globals without teardown |
| Animation / CSS transition (e2e) | Screenshot or click flakes only in the browser | Assert on the end state with a web-first assertion, or disable animations for the test run; never `waitForTimeout` |
| Leftover process/server from a previous run | "Port in use", stale data from an earlier failed run | `manage_task` to confirm nothing is still running before starting; clean up in `afterEach`/`t.Cleanup()` even on failure |
| Snapshot drift (timestamps, generated ids, locale) | Snapshot test fails only in CI or only with `-u` | Normalize or mask volatile fields before snapshotting; never snapshot a raw timestamp or generated id |
| Resource cleanup skipped on failure | A failing test corrupts the next one | Use the runner's guaranteed teardown (`afterEach`, `t.Cleanup()`, `IDisposable`, `ExUnit.Callbacks`), not end-of-test cleanup code that a failed assertion skips |

## After applying a fix
Rerun `repeat-run.mjs --times 10` (20+ for a rare flake) and confirm `REPEAT: PASS`. If it still fails
intermittently, you have not found the real cause yet - go back to the table, or stop and report FAIL with the
failure captured as the repro (command + failing output); the orchestrator routes it to a `debugger` worker.

## References
- Determinism proof script: `node .agents/skills/write-tests/scripts/repeat-run.mjs --help`
- Framework-specific fake-time, fake-network, and order/repeat flags: [frameworks.md](frameworks.md)
- Test smells that often hide a flake: [edge-cases.md](edge-cases.md)
