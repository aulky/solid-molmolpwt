# Playwright cookbook for agents

> Last checked in 2026-09 against Playwright 1.63 (the npm `latest` tag was 1.63.0, and the docs came from
> context7 `/microsoft/playwright/v1.63.0`). Before you use a newer API, check the installed version with
> `bunx playwright --version` or `npx playwright --version`. Items marked "recent" may be missing from older versions.
> Commands below use `bun`/`bunx`; substitute the project's runner from AGENTS.md / the lockfile (`npx`, `pnpm exec`, ...).

## 1. Config baseline (annotated)
```ts
// playwright.config.ts: compare this with the repo's config; do not overwrite it
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000"; // use the port the app really serves on

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,                       // tests must therefore be independent
  forbidOnly: !!process.env.CI,              // a stray test.only fails CI
  retries: process.env.CI ? 2 : 0,           // retries only in CI; local retries hide flakiness
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]], // "open" defaults to on-failure, which blocks agents
  use: {
    baseURL,
    trace: "on-first-retry",                 // "retain-on-failure" is fine locally too
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run dev",                  // or build + start for production-like runs
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```
- **Dev server or production build.** A production build (`build` then `start`) catches build-only bugs and
  runs faster. A dev server starts faster. Keep whichever one the repo already uses.
- **Run the command from the repo root**, where the config lives, so relative paths such as storageState
  files resolve predictably.

## 2. Locators (priority order)
| Priority | Locator | Example |
|---|---|---|
| 1 | Role + accessible name | `page.getByRole("button", { name: "Save" })` |
| 2 | Form label | `page.getByLabel("Email")` |
| 3 | Placeholder | `page.getByPlaceholder("Search")` |
| 4 | Visible text (non-interactive) | `page.getByText("No results")` |
| 5 | Alt / title | `page.getByAltText("Logo")`, `page.getByTitle("Close")` |
| 6 | Test id (fallback) | `page.getByTestId("cart-total")` (attribute is `data-testid`; change it with `use.testIdAttribute`) |
| never | CSS classes, XPath, `nth()` by position | They break on styling or reordering |

- **Scope to a region.** `page.getByRole("navigation").getByRole("link", { name: "About" })`.
- **Filter.** `page.getByRole("listitem").filter({ hasText: "Milk" }).getByRole("button", { name: "Delete" })`.
  You can also filter with `{ has: page.getByRole("img") }` or `{ visible: true }` (recent).
- **Exact match.** `getByText("Home", { exact: true })`. By default name and text matching is
  case-insensitive substring matching.
- **Strict mode.** An action on a locator that matches more than one element throws. Narrow the locator
  instead of reaching for `.first()`.
- **Frames.** `page.frameLocator("#payment").getByRole("textbox", { name: "Card number" })`.

## 3. Assertions (web-first; they retry until the timeout)
| Need | Assertion |
|---|---|
| Presence | `await expect(loc).toBeVisible()` / `.toBeHidden()` / `.toBeAttached()` |
| Text | `.toHaveText("exact" or /regex/)`, `.toContainText("part")` |
| Form state | `.toHaveValue("x")`, `.toBeChecked()`, `.toBeEnabled()`, `.toBeDisabled()`, `.toBeEditable()` |
| Attributes | `.toHaveAttribute("aria-expanded", "true")`, `.toHaveClass(/active/)`, `.toHaveCSS("display", "none")` |
| Lists | `.toHaveCount(3)`, `.toHaveText(["a", "b", "c"])` |
| Page | `await expect(page).toHaveURL(/\/about$/)`, `await expect(page).toHaveTitle(/Home/)` |
| Accessibility tree | `.toMatchAriaSnapshot(yaml)` (see section 10) |
| Pixels | `await expect(page).toHaveScreenshot("name.png")` (see section 10) |
| Non-DOM value | `await expect.poll(() => api.getStatus()).toBe("done")` |
| Block that must eventually pass | `await expect(async () => { ... }).toPass({ timeout: 10_000 })` |
| Keep going after a failure | `await expect.soft(loc).toHaveText("x")` |

- **Negations wait too.** `await expect(loc).not.toBeVisible()` retries until the element is gone.
- **Per-call timeout.** `await expect(loc).toBeVisible({ timeout: 10_000 })`. Change the global value in
  `expect: { timeout }` only with a reason.
- **Never assert on a one-shot read.** `expect(await loc.textContent()).toBe(...)` and
  `expect(await loc.isVisible()).toBe(true)` do not retry, so they flake.

## 4. Waiting correctly
- **Actions auto-wait.** `click`, `fill`, `check` and `selectOption` wait until the element is attached, visible,
  stable, enabled and receiving events. Do not add waits before them.
- **Waiting on a request your action triggers.** Start waiting before the action:
  ```ts
  const saved = page.waitForResponse((r) => r.url().includes("/api/todos") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Save" }).click();
  expect((await saved).ok()).toBe(true);
  ```
- **Navigation.** After a click that navigates, `await expect(page).toHaveURL(...)` is enough.
- **SSR hydration.** With server rendering, an interaction can land before the client code has attached its
  handlers. The symptom is a click that does nothing, and only in tests. Wait for a client-only signal before
  you interact, such as an element or attribute that renders after mount. Some frameworks replay early
  events and some do not, so confirm it with a trace. Never paper over it with a sleep.
- **Forbidden waits.** `page.waitForTimeout(ms)` is for debugging only. `waitForLoadState("networkidle")`
  is discouraged by the docs. Hand-rolled polling loops belong in `expect.poll` or `toPass` instead.

## 5. Isolation and test data
- **Each test gets a fresh browser context** with its own cookies and storage. Never share a `page` or
  module-level mutable state between tests.
- **No order dependence.** Use `test.describe.configure({ mode: "serial" })` only when the steps really are
  one scenario, and write the reason in a comment. Prefer merging them into one test with `test.step`.
- **Create data per test**, through the API (the `request` fixture) or a fixture. Give it a unique name:
  `` `item-${test.info().workerIndex}-${Date.now()}` ``. Clean it up in the fixture teardown.
- **Per-worker resources.** Use a worker-scoped fixture (`{ scope: "worker" }`), for example one account per worker.

## 6. Fixtures
```ts
// e2e/fixtures.ts
import { test as base, expect, type Page } from "@playwright/test";

class HomePage {
  constructor(readonly page: Page) {}
  counter = () => this.page.getByRole("button", { name: /clicks:/i });
  async goto() { await this.page.goto("/"); }
}

export const test = base.extend<{ home: HomePage; failOnConsoleErrors: void }>({
  home: async ({ page }, use) => {
    const home = new HomePage(page);
    await home.goto();
    await use(home);                     // code after use() is teardown
  },
  failOnConsoleErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(e.message));
    await use();
    expect(errors, "console or page errors during the test").toEqual([]);
  }, { auto: true }],                    // auto: runs for every test that imports this `test`
});
export { expect };
```
- Specs then `import { test, expect } from "./fixtures";`.
- Fixture names must be valid identifiers. A fixture is set up only when a test requests it, unless it is `auto`.
- Recent versions also expose `page.consoleMessages()` and `page.pageErrors()` for reading messages after the fact.

## 7. Authentication with storageState
```ts
// e2e/auth.setup.ts
import { test as setup, expect } from "@playwright/test";
const authFile = "playwright/.auth/user.json";   // relative to the repo root; git-ignore playwright/.auth

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_USER ?? "");
  await page.getByLabel("Password").fill(process.env.E2E_PASSWORD ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible(); // cookies are set by now
  await page.context().storageState({ path: authFile });
});
```
```ts
// playwright.config.ts (projects)
projects: [
  { name: "setup", testMatch: /.*\.setup\.ts/ },
  { name: "chromium", use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
    dependencies: ["setup"] },
],
```
- **Keep credentials out of the repo.** Read them from environment variables, and never commit or print them.
  State files contain session cookies, so they must be git-ignored.
- **Several roles.** Use one state file per role and pick one per file with
  `test.use({ storageState: "playwright/.auth/admin.json" })`.
- **Logged-out tests.** `test.use({ storageState: { cookies: [], origins: [] } })`.
- **ESM projects** (`"type": "module"`) have no `__dirname`. Use a repo-root-relative string, as shown above.

## 8. Network mocking
```ts
await page.route("**/api/products", (route) => route.fulfill({ json: [{ id: 1, name: "Mock" }] }));
await page.route("**/api/flags", async (route) => {            // patch a real response
  const response = await route.fetch();
  const json = { ...(await response.json()), newCheckout: true };
  await route.fulfill({ response, json });
});
await page.route(/\.(png|jpe?g|webp)$/, (route) => route.abort()); // drop heavy assets
```
- **Register routes before `page.goto`.** Use `context.route` to cover every page in the context.
- **URL globs.** Recent versions do not support `?` and `[]` in URL globs. Use a RegExp for anything complex.
- **Mocking scope.** Mock third-party services (payments, analytics, maps). Keep your own backend real in
  E2E. Contract-level mocking belongs in integration tests.

## 9. Time and randomness
```ts
await page.clock.install({ time: new Date("2026-01-01T09:00:00Z") }); // before goto
await page.goto("/");
await page.clock.fastForward("01:00");                            // +1 minute; timers fire
await page.clock.setFixedTime(new Date("2026-01-01T10:00:00Z"));  // Date.now() is frozen
```
Seed or mock randomness in the app's test mode. Never assert on values that depend on the current time.

## 10. Visual and aria snapshots
- **Screenshots.** Use `await expect(page).toHaveScreenshot("home.png", { mask: [page.getByTestId("clock")] })`.
  - The first run fails and writes a baseline. Review that baseline before you commit it.
  - Baselines depend on the OS and browser (the file name carries a suffix such as `-chromium-win32`).
    Generate them in the environment that checks them (usually CI or the Playwright Docker image).
  - Update them only for intended changes: `--update-snapshots`.
- **Aria snapshots** check structure and names without pixels.
  - Get the real tree first with `console.log(await page.getByRole("main").ariaSnapshot())`.
  - Paste the stable part into `await expect(page.getByRole("main")).toMatchAriaSnapshot(\`...\`)`.
  - Matching is partial, so leave out volatile nodes.
- **Accessibility scans.** `@axe-core/playwright` gives WCAG checks: `new AxeBuilder({ page }).analyze()`,
  then assert `violations` is empty. It is an extra dev dependency: a worker never adds it; when the brief asks for a11y
  coverage and it is missing, report BLOCKED with `Setup needed: bun add -d @axe-core/playwright`.

## 11. Running: agent-safe CLI
| Goal | Command (append to the project's e2e script, e.g. `bun run test:e2e`, or use `npx playwright test`) |
|---|---|
| One file, readable output | `--reporter=list e2e/home.spec.ts` |
| One test by title | `-g "user can increment"` |
| By tag (`test("x", { tag: "@smoke" }, ...)`) | `--grep @smoke`, exclude with `--grep-invert @slow` |
| Only last failures | `--last-failed` |
| Only files changed vs git (git repos only) | `--only-changed` or `--only-changed=origin/main` |
| Flake hunt | `--repeat-each=5 --retries=0` (add `--workers=1` to rule out parallel interference) |
| Fail when anything is flaky | `--fail-on-flaky-tests` |
| Force a trace | `--trace on` (other modes: `retain-on-failure`, `on-first-retry`) |
| One project | `--project=chromium` |
| List tests without running | `--list` |
| CI sharding | `--shard=1/4` |

- **Never run these from `run_command`.** They open interactive UIs and never exit: `--ui`, `--debug`,
  `show-report`, `show-trace`, `codegen`, the `PWDEBUG=1` env var. `--headed` also opens windows. Give
  these commands to the user instead.
- **Artifacts.**
  - `test-results/<test-folder>/`: screenshots, `trace.zip`, videos.
  - `playwright-report/`: the HTML report.
  - `test-results/.last-run.json`: the record `--last-failed` uses.
- **Trace from the terminal** (recent; verified in the 1.63 sources):
  ```
  bunx playwright trace open test-results/<test-folder>/trace.zip
  bunx playwright trace actions --errors-only
  bunx playwright trace action <id>
  bunx playwright trace console --errors-only
  bunx playwright trace requests --failed
  bunx playwright trace close
  ```
- **Missing browsers.** An `Executable doesn't exist` error means the browser is not installed. The fix is
  `bunx playwright install chromium` (`--with-deps` also installs the OS packages, Linux CI). A worker does not
  run it: report BLOCKED with `Setup needed: bunx playwright install chromium`.

## 12. Parallelism and CI
- **`fullyParallel: true`** runs the tests inside one file in parallel as well. That requires section 5.
- **Limits.** Use `workers` per run or `testProject.workers` per project. Isolate data per worker with `test.info().workerIndex`.
- **CI sequence.**
  1. Install dependencies from the lockfile.
  2. `npx playwright install --with-deps chromium`.
  3. Run the tests.
  4. Upload `playwright-report/` as an artifact with `if: ${{ !cancelled() }}`.
- **Pull requests.** Running `--only-changed=origin/$GITHUB_BASE_REF` first fails fast. It needs a full-depth checkout.

## 13. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `waitForTimeout(2000)` | Flaky under load, slow when idle | Web-first assertion or `waitForResponse` |
| `locator(".btn.primary > span")` | Breaks on restyling | `getByRole("button", { name })` |
| `expect(await el.isVisible()).toBe(true)` | No retry | `await expect(el).toBeVisible()` |
| Test B needs data from test A | Breaks under parallelism, retries and `-g` | Create the data per test in a fixture |
| Local `retries: 2` | Hides flakiness | `retries: process.env.CI ? 2 : 0` |
| Asserting implementation details (CSS, internal state) | Brittle, does not prove user value | Assert what the user sees |
| Hitting real third-party APIs | Slow, rate-limited, nondeterministic | `page.route` mocks |
| Snapshot baselines made on a dev laptop | OS rendering differs from CI | Generate them in the CI environment |
| `test.only` or `test.skip` left behind | Silently shrinks the suite | `forbidOnly`, plus the forbidden-pattern scan |
| One giant test for a whole journey | A failure is hard to localize | Several tests, or `test.step` sections |

## 14. Other stacks
- **Python.** `pytest-playwright` uses the same model: `page.get_by_role(...)`, `expect(loc).to_be_visible()`,
  `to_match_aria_snapshot`. Use it when the repo is Python-first and already runs pytest.
- **Java and .NET.** Playwright has official ports with the same locator and assertion model
  (`assertThat(...)`, `Expect(...)`).
- **Server-rendered backends** (Laravel, Rails, Django, Phoenix). Keep the framework's own browser tests if
  they exist (Dusk, Capybara system tests). Otherwise a Playwright TS project in `e2e/` against the running
  app works for any backend.
