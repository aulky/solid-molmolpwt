---
name: e2e-test
description: Writes, runs and debugs BROWSER tests with Playwright (role locators, web-first assertions, fixtures, traces) for changed user flows, plus exploratory UI checks via the chrome-devtools MCP or /browser. The e2e-tester's TEST-phase playbook; non-browser tests go to /write-tests. Use for e2e, browser, user-flow, flaky-e2e or Playwright work.
metadata:
  icon: 🎭
---

# E2E test: Playwright specs for browser behaviour, plus exploratory checks

Used by: `e2e-tester` (TEST phase, Mode A). The orchestrator may use Mode B (exploratory, writes no file) while
grading a result.

Scope: BROWSER behaviour only - anything a user does in a real page (navigate, click, type, see). Proof is a
Playwright spec that passes. Non-browser behaviour (pure logic, components in jsdom, HTTP handlers, CLI output) is
the `test-engineer`'s job via `/write-tests`: report it as `OUT OF SCOPE: non-browser <behaviour> -> test-engineer`.

Default: Playwright Test (`@playwright/test`). Only if the repo already uses a different E2E runner (Cypress,
WebdriverIO, Selenium), keep that runner and follow its conventions.

Project setup: take the config path, `webServer` port, spec folder and run command from `playwright.config.*`,
root `AGENTS.md` and the `package.json` scripts; the full gate is `node .agents/scripts/verify.mjs --e2e`. With
`reuseExistingServer`, a server already listening on the `webServer` port is reused and NOT rebuilt.
Example (sample SolidStart + bun project): Chromium, port 3000, `webServer` = `bun run build && bun run start`,
specs `e2e/*.spec.ts`, run with `bun run test:e2e`.

## When to use
- A TEST-phase brief for the `e2e-tester`: prove the changed user-visible flows (navigation, forms, auth,
  client-side state) in a real browser.
- A UI change needs proof that it works in a real browser.
- An E2E test fails or is flaky.
- Exploratory check (Mode B): "open the page and see whether X works", or check the console and network for errors.

Do NOT use for:
- Unit, component or API logic. Use `/write-tests` (test-engineer), which is faster and more precise.
- Performance budgets or Lighthouse runs. Use `/perf-audit`.
- Pure visual-design critique. Use `.agents/rules/topic-ui-quality.md`.
- Testing third-party sites you do not own. Mock them with `page.route` instead.

## Checklist
Copy this and tick items as you go:
```
- [ ] Setup known: testDir, baseURL/port, webServer, reporter never opens a browser, run command
- [ ] `webServer` port free before the first run (if a server would be reused), or BLOCKED reported
- [ ] Scenarios listed as user-visible outcomes (1 per acceptance criterion + 1 negative/edge case)
- [ ] Locators: getByRole/getByLabel/getByText first; getByTestId only as fallback; no CSS/XPath chains
- [ ] Assertions: web-first `await expect(locator)...` only; no waitForTimeout or sleeps
- [ ] Tests independent: no order dependence, no shared mutable state, data created per test
- [ ] Single-file run passes, then the full e2e suite passes
- [ ] New tests pass 3 repeats (`--repeat-each=3`) with retries off
- [ ] Forbidden-pattern scan clean in the files you touched (only/skip/fixme/timeouts)
- [ ] `node .agents/scripts/verify.mjs --e2e` passes after the last edit (kept product-bug spec: `--quick`)
- [ ] Worker Report written in the e2e-tester.md Output format
```

## Procedure
Mode A (default, e2e-tester) writes or changes a spec. Mode B, exploratory, writes no file and starts at step 8.

1. **Read the setup.** View `playwright.config.ts` and one existing spec. Note: `testDir`, `use.baseURL`,
   `webServer` (command, url, `reuseExistingServer`), `retries`, `trace`, `screenshot`, `reporter`, and `projects`.
   - If the HTML reporter can open automatically (the default opens it on failure), pass
     `--reporter=list` on every run you make. An open report never exits and hangs `run_command`.
   - No Playwright in the repo (no `playwright.config.*`, no `@playwright/test` in `package.json`): NEVER install
     it yourself, because a dependency change is a planned task of its own. Instead report BLOCKED with
     `Setup needed: bun add -d @playwright/test` then `bunx playwright install chromium` (npm: `npm i -D ...`,
     `npx playwright install chromium`; use the package manager named in AGENTS.md / the lockfile).
   - Verify: you can name the run command, the base URL and the test directory.
2. **List scenarios.** Write each one as `user can <action> → <observable result>`, one per acceptance criterion
   in the brief. Include one negative or edge case (invalid input, empty state, 404 route). Leave out anything
   the user cannot observe in the page.
   - Verify: every scenario ends in an assertion you can write with `expect(...)`.
3. **Find locators from the source, not by guessing.** Read the component or route files, or take an
   accessibility snapshot (step 8). Priority: `getByRole(role, { name })` → `getByLabel` →
   `getByPlaceholder` → `getByText` → `getByTestId`. Never use generated classes, `nth()` or XPath.
   - Nothing accessible: never edit the component, because app code goes through IMPLEMENT and REVIEW. Report
     `OUT OF SCOPE: <path> needs an aria-label or data-testid` (the orchestrator plans an IMPLEMENT task).
   - Verify: each locator targets exactly one element. Playwright runs in strict mode, and a "strict mode
     violation" error means the locator matched several elements.
4. **Write the spec** in `e2e/<feature>.spec.ts` (an OWNED FILE). Follow the template below and the cookbook
   [references/playwright.md](references/playwright.md) (fixtures, auth, mocking, clock, aria snapshots).
   - Every `expect` on the page is awaited and web-first: `await expect(locator).toHaveText(...)`.
   - NEVER use `page.waitForTimeout`, `setTimeout` or `waitForLoadState('networkidle')`. Fixed waits flake
     under load, and the docs discourage `networkidle`. Instead, assert on the state you expect, or
     `await page.waitForResponse(...)` for a request your action triggers.
   - Put shared setup in fixtures (`test.extend`), not in module-level variables. Use `test.step` to split long flows.
   - Mock third-party or slow APIs with `page.route(...).fulfill({ json })`. Keep your own backend real
     unless the scenario says otherwise.
   - Verify: run the scan in step 6.
5. **Run one file.** Before the first run, check the `webServer` port (`<port>` from `playwright.config.*`) with
   `Get-NetTCPConnection -LocalPort <port> -State Listen -ErrorAction SilentlyContinue`. Any output means a running
   server that Playwright would reuse without rebuilding your change: report BLOCKED with
   `Setup needed: stop the server on port <port>`. Never stop a process you did not start.
   Then run the project's e2e script (AGENTS.md) with the file appended, e.g. `bun run test:e2e --reporter=list
   e2e/<feature>.spec.ts` (bun passes extra arguments through; npm needs `--`), or
   `npx playwright test --reporter=list <file>`.
   - If `run_command` hands back a background task, check it with `manage_task` (`Action: "status"`) until it
     exits. Read the summary line (`N passed`, `N failed`, `N flaky`) before you draw any conclusion.
   - Verify: exit code 0 and the expected number of tests passed. `0 tests` means your file or grep did not match.
6. **Scan for forbidden patterns** in the files you touched:
   `node .agents/scripts/search.mjs "waitForTimeout|networkidle|\.only\(|\.skip\(|test\.fixme|setTimeout\(" e2e`
   - Verify: no hits in the files you touched; remove every one. A pre-existing, platform-guarded `test.skip` in
     a file you did not touch is listed under `Evidence:`, not removed.
7. **On failure, classify before you fix.** Read the error, the call log, and the files in `test-results/<test>/`
   (screenshot, trace). To inspect a trace without the GUI, try `npx playwright trace open <trace.zip>` (or `bunx`), then
   `trace actions --errors-only`, `trace console --errors-only` and `trace requests --failed`. These commands
   exist in recent Playwright; if yours rejects them, rely on the error, the screenshot and a `--trace on` rerun.
   | Class | Signal | Action |
   |---|---|---|
   | Product bug | App shows a wrong state; a manual check agrees | Keep the test as it is. Report it under `Product bugs:` (path:line, observed vs expected); status FAIL. The orchestrator routes it to a fixer |
   | Test bug | Wrong locator, strict-mode violation, wrong expectation | Fix the test so it matches the stated requirement |
   | Timing | Passes on rerun, or an action ran before hydration or data | Wait on the real signal (web-first assertion or `waitForResponse`). Never add a sleep |
   | Environment | `Executable doesn't exist`, port in use, webServer timeout | BLOCKED with `Setup needed: <command>` (`npx playwright install chromium`, stop the server on the `webServer` port, check `webServer.url`) |
   - At most 3 test-fix rounds. Then stop and report FAIL with the findings and your next 2 hypotheses; the
     orchestrator decides whether a `debugger` task follows. Never start one yourself.
   - NEVER weaken an assertion, add a retry, or skip a test to get green. The tests encode the requirement.
     Report the test as wrong, with evidence, if you believe it is.
8. **Exploratory check (Mode B, or to confirm a result by hand).** Prefer the production build that the
   Playwright `webServer` starts; start the project's dev script (AGENTS.md) only when the user or brief asks for it (as a long-running
   `run_command` with its own backgrounding, never a shell `&`), and read the URL it prints.
   Then pick the first option that is available:
   - **chrome-devtools MCP**, if your tools list it. Use `call_mcp_tool` for `new_page` → `wait_for` (a text) →
     `take_snapshot` (the a11y tree with `uid`s) → `click` / `fill` by `uid` → `list_console_messages`
     (types `error`, `warn`) → `list_network_requests` → `take_screenshot` with `filePath`. Take a new snapshot
     after every navigation. MCP tools can fail to execute inside subagents; if a call errors, use the next option.
   - **Antigravity browser** (orchestrator only). Ask the user to run `/browser <instruction with URL and expected
     result>`. No agent can start the built-in `browser` subagent through `invoke_subagent`.
   - **Neither is available.** Use Mode A: write the check as a spec in your OWNED FILES and run it; it stays as coverage.
   - Stop any server you started afterwards (`manage_task`, `Action: "kill"`).
   - Verify: you recorded the console error count, any failed requests, and the observed versus expected result.
     e2e-tester: turn every bug you find into a failing Playwright test (Mode A) and report it as a product bug.
     Orchestrator: every bug you find becomes a FIX task, never your own edit.
9. **Flake check.** Run the e2e command with `--reporter=list --repeat-each=3 --retries=0 e2e/<feature>.spec.ts`
   (e.g. `bun run test:e2e ...`). Then the whole suite once with `--reporter=list`.
   - Verify: all repeats pass and no other spec broke. A failure in any repeat is a real problem. Go back to step 7.
10. **Gate.** Run `node .agents/scripts/verify.mjs --e2e`, following `/verify` for failures.
    - Kept a failing spec for a product bug: run `node .agents/scripts/verify.mjs --quick` instead (it must print
      `VERIFY: PASS`) and quote the e2e failure under `Evidence:` as "fails by design: product bug". If a QUALITY
      GATE message then fires, edit neither the spec nor app code; send the FAIL report.
    - Verify: the final line is `VERIFY: PASS` after your last edit (`--e2e`, or `--quick` in the product-bug case).

### Spec template
```ts
import { test, expect } from "@playwright/test";

test.describe("counter", () => {
  test("user can increment the counter", async ({ page }) => {
    await page.goto("/");
    const button = page.getByRole("button", { name: /clicks:/i });
    await expect(button).toHaveText("Clicks: 0");
    await button.click();
    await expect(button).toHaveText("Clicks: 1"); // auto-waits; no sleep
  });

  test("unknown route shows the not-found page", async ({ page }) => {
    await page.goto("/does-not-exist");
    await expect(page.getByRole("heading", { name: "Not Found" })).toBeVisible();
  });
});
```
Bad → good:
```ts
await page.waitForTimeout(2000);                     // bad: fixed sleep
expect(await page.locator(".btn-1").isVisible()).toBe(true); // bad: CSS class + one-shot check
await expect(page.getByRole("button", { name: "Save" })).toBeVisible(); // good
```

### Config expectations (to check, not to rewrite)
- `retries: process.env.CI ? 2 : 0`. Retries only in CI, because local retries hide flakiness.
- `forbidOnly: !!process.env.CI`, `fullyParallel: true`, `workers: process.env.CI ? 1 : undefined`.
- `use: { baseURL, trace: "on-first-retry", screenshot: "only-on-failure" }`.
- `webServer: { command, url, reuseExistingServer: !process.env.CI }`, so Playwright starts the app itself.
- `reporter` contains `["html", { open: "never" }]` or `list`. Otherwise add `--reporter=list` to every run.
- `.gitignore` covers `/test-results/`, `/playwright-report/`, `/blob-report/` and `playwright/.auth/`.
- If one of these is missing, write it under `OUT OF SCOPE:` as a proposed change; never edit the config
  (config changes are an IMPLEMENT task).

## Output
Workers: use the Output format in `.agents/agents/e2e-tester.md` exactly; it is authoritative. The block below
copies its body fields, for orchestrator or ad-hoc use. Non-browser behaviour and missing labels go on
`OUT OF SCOPE:` lines at the top of the body.
```text
## e2e-tester: <PASS | FAIL | BLOCKED> — <T-id>
Specs:
- `<path>` (new | edit) - <n> tests
Scenarios:
- [x] user can <action> -> <result> - pass
Commands:
- `<command>` -> exit <code>; <summary line>
Flake check: <repeat-each=3 -> N passed | not run: reason>
Product bugs: <path:line - observed vs expected | none>
Trace: <test-results/.../trace.zip | none>
Setup needed: <command | none>
Evidence: <command -> key output lines | path:line>; `verify.mjs --e2e [or --quick]` -> <VERIFY line>
Files touched: <list | none>
Lesson candidates: <one-line "when X, do Y because Z" | none>
```
Mode B (orchestrator, no file written): note in your grading `Exploratory: <tool> — console errors <n>, failed
requests <n>, observed vs expected`.

## References
- Cookbook: [references/playwright.md](references/playwright.md) (config, locators, assertions, fixtures,
  auth with storageState, mocking, clock, visual and aria snapshots, CLI flags, agent-safe debugging)
- Test strategy: `.agents/guides/principles/testing-strategy.md`
- Worker contract: `.agents/agents/e2e-tester.md`. How the orchestrator briefs it: `/orchestrate`,
  `.agents/skills/orchestrate/references/briefs.md` §e2e-tester.
- Failure loop and background runs: `/verify`. Non-browser tests: `/write-tests` (test-engineer).
- Official docs: https://playwright.dev/docs/best-practices, https://playwright.dev/docs/locators,
  https://playwright.dev/docs/test-assertions
