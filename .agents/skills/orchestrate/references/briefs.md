# Briefs: one filled brief per worker type

The brief is the ONLY thing a worker sees. It has no chat history, no board, no earlier reports.
1. Use every field below, in this order, with these exact names (only ALLOWED COMMANDS may be omitted).
2. ONE objective per brief. The word "and" joining two outcomes in OBJECTIVE means two tasks.
3. Paste facts inline: absolute workspace root, `path:line` findings, 5-20 line snippets, decisions.
4. DONE WHEN is numbered and checkable; the last line is normally a command with its expected output.
5. Fill the shared CONTEXT block below from root `AGENTS.md` once per pipeline and reuse it in every brief.

## Template (exact, from `.agents/rules/03-orchestration.md`)
```text
TASK: <T-id> | PHASE: <EXPLORE|PREPARE|IMPLEMENT|REVIEW|FIX|TEST|LEARN> | AGENT: <TypeName>
OBJECTIVE: <exactly one outcome, one sentence>
CONTEXT: <facts pasted inline: stack, absolute workspace root, paths, snippets, decisions, prior worker
         findings with path:line; environment: Windows, run_command = PowerShell, `python` not `python3`, pm = <pm>>
OWNED FILES: <files this worker may create or edit> | read-only
ALLOWED COMMANDS: <exact commands the worker may run that write or install> | none
DO NOT: <out-of-scope paths and actions>
DELIVERABLE: <exact format; defaults to the agent's own Output format>
DONE WHEN: <numbered checkable criteria>
Report once with send_message using the Worker Report envelope.
```
`ALLOWED COMMANDS:` is optional (omitted = `none`); an implementer or fixer runs an install or other writing
command only when it is listed there exactly. Separate entries with `; `; each runs as its own
`run_command` (never chained). The scribe's own `lessons.mjs` commands need no entry. The advisor is always
`PHASE: CONSULT` (name the consulted phase in OBJECTIVE). The guard denies a Prompt without exactly one `TASK: T<n>`, one
`OBJECTIVE:`, an `OWNED FILES:` and a `DONE WHEN:` line.

## Shared CONTEXT lines (template: copy from root AGENTS.md)
```text
- Workspace root: <absolute workspace root>. Stay inside it.
- Stack: <Stack lines from AGENTS.md: language, framework + versions, aliases, idioms>.
- Environment: <OS; shell run_command uses; python/pm facts from AGENTS.md (never guess the pm: the lockfile names it)>;
  search with `node .agents/scripts/search.mjs "<regex>" <path>`. <git repository or not>.
- Checks: `node .agents/scripts/verify.mjs --quick` (formatting is NOT checked: run the project's formatter in write
  mode on your files only). A FAIL only in files outside your OWNED FILES -> quote it under OUT OF SCOPE, do not
  fix it. <unit test command>; <e2e command, dev port and server-reuse caveat, from AGENTS.md Commands>.
```
Example of a filled block (sample SolidStart + bun project; the briefs below use it unless they name another root):
```text
- Workspace root: J:/work/solid-app. Stay inside it.
- Stack: SolidJS 1.9 + SolidStart v2 (Vite plugin), @solidjs/router, Tailwind v4, TypeScript strict,
  alias ~/* -> src/*. Solid idioms: class not className, never destructure props.
- Environment: Windows 11; run_command = PowerShell; use `python`, never `python3`; pm = bun (never npm/pnpm);
  no rg/grep: search with `node .agents/scripts/search.mjs "<regex>" <path>`. Not a git repository.
- Checks: `node .agents/scripts/verify.mjs --quick` (lint, kit doctor, typecheck; formatting is NOT checked: run
  `bunx biome format --write <your files>`). A FAIL only in files outside your OWNED FILES -> quote it under
  OUT OF SCOPE, do not fix it. `bun run test` (vitest);
  `bun run test:e2e` (Playwright, port 3000; a running server there is reused, not rebuilt).
```

## Worked lane-M example (sample SolidStart + bun project): "Add a Contact page at /contact, linked from the nav"
Lane M: new route + nav change + e2e spec = 3 files; no API, schema, auth or dependency change.
```text
Lane: M - 3 files, new route — Type: feature — Acceptance criteria:
1) /contact shows the heading "Contact"  2) the nav has a Contact link  3) the link is active on /contact
| T-id | Phase | Agent(s) | Objective | Owned files | Status | Evidence |
|---|---|---|---|---|---|---|
| T1 | EXPLORE | explorer | map route and nav patterns | read-only | PASS | Nav.tsx:5-6, about.tsx:4-8 re-opened |
| T2 | EXPLORE | docs-researcher | router active-link API | read-only | PASS | node_modules/@solidjs/router types line cited |
| T3 | PREPARE | planner | criteria + task table | read-only | PASS | 3 tasks, disjoint files |
| T4 | IMPLEMENT | implementer | create /contact page | src/routes/contact.tsx | PASS | verify --quick PASS (rerun) |
| T5 | IMPLEMENT | implementer | add Contact nav link | src/components/Nav.tsx | PASS | verify --quick PASS |
| T6 | REVIEW | reviewer | review T4+T5 | read-only | FIX | 1 major: trailing slash |
| T7 | FIX | fixer | T7 FIX of T5, round 1 | src/components/Nav.tsx | PASS | Nav.tsx:5-7 re-opened |
| T8 | REVIEW | reviewer | re-check Nav.tsx:4-9 | read-only | PASS | APPROVE |
| T9 | TEST | test-engineer | unit-test the active-link rule | src/components/Nav.test.tsx | PASS | bun run test 5 passed |
| T10 | TEST | e2e-tester | prove the /contact flow | e2e/contact.spec.ts | PASS | 2 passed, repeat-each 3 |
| T11 | LEARN | scribe | record lessons + facts | .agents/memory/lessons.md, AGENTS.md | PASS | L-0012 added |
Waiting on: 0 worker(s). FIX rounds: T5=1. Advisor consults: 0/4.
```
Waves: W1 = T1, T2 · W2 = T3 · W3 = T4, T5 (disjoint files) · W4 = T6 · W5 = T7 · W6 = T8 · W7 = T9, T10 · W8 = T11.

## explorer (EXPLORE; one area per explorer)
```text
TASK: T1 | PHASE: EXPLORE | AGENT: explorer
OBJECTIVE: Map how routes are defined and how the nav marks the active link, so a /contact page can copy them.
CONTEXT:
- <shared CONTEXT lines>
- File routes live in src/routes/ (index.tsx = /, about.tsx = /about). The nav is src/components/Nav.tsx.
- Start from: src/routes/about.tsx, src/components/Nav.tsx, src/app.tsx.
OWNED FILES: read-only
DO NOT: edit, create or delete any file; read outside J:/work/solid-app; read node_modules/ or .output/.
DELIVERABLE: your Output format: max 30 lines of `path:line - fact`, then "Sibling to copy:" and "Open questions:".
DONE WHEN:
1. The route component shape and the nav active-link logic are each cited with path:line.
2. Every cited line exists (you viewed it; no line numbers from memory).
3. Existing e2e specs that cover the nav are listed (e2e/*.spec.ts).
Report once with send_message using the Worker Report envelope.
```

## docs-researcher (EXPLORE; library or API facts, version-matched)
```text
TASK: T2 | PHASE: EXPLORE | AGENT: docs-researcher
OBJECTIVE: Answer how the installed @solidjs/router marks an active link.
CONTEXT:
- <shared CONTEXT lines>
- package.json: "@solidjs/router": "^1.0.0"; the installed version is in node_modules/@solidjs/router/package.json.
- Q1: Does <A> support activeClass / inactiveClass / end props? Exact prop names and defaults.
- Q2: Does <A> set aria-current="page" on the active link?
- Order: installed types and source first (node_modules/@solidjs/router/dist/*.d.ts), then official docs.
- NETWORK: allowed (docs sites only; never send workspace code).
OWNED FILES: read-only
DO NOT: edit files; install or upgrade packages; answer from memory without a source.
DELIVERABLE: your Output format: per question: answer, source (path:line or URL), installed version, confidence.
DONE WHEN:
1. Q1 and Q2 each have an answer with a cited source.
2. The installed version is quoted from node_modules/@solidjs/router/package.json.
Report once with send_message using the Worker Report envelope.
```

## git-historian (EXPLORE; why odd code exists; git repos only; other scenario)
```text
TASK: T21 | PHASE: EXPLORE | AGENT: git-historian
OBJECTIVE: Find out why src/lib/price.ts:12-18 rounds with Math.floor instead of Math.round before it is refactored.
CONTEXT:
- Workspace root: J:/work/shop (a git repository). TARGET: src/lib/price.ts lines 12-18, function roundCents.
- Snippet (src/lib/price.ts:12-18): <paste the 7 lines>
- The refactor plans to replace roundCents with a shared helper; we must know whether floor is intentional.
OWNED FILES: read-only
DO NOT: edit files; run any git command that writes (commit, checkout, reset, stash, rebase); read outside J:/work/shop.
DELIVERABLE: your Output format: introducing commit, linked issue/PR if any, stated reason, confidence, what breaks if changed.
DONE WHEN:
1. The commit that introduced Math.floor is named (hash, date, subject) from `git log -L 12,18:src/lib/price.ts`.
2. The reason is quoted from a commit message, issue, test or comment - or "no recorded reason" is stated.
Report once with send_message using the Worker Report envelope.
```

## planner (PREPARE; lane M and L)
```text
TASK: T3 | PHASE: PREPARE | AGENT: planner
OBJECTIVE: Produce acceptance criteria and a task table for adding a Contact page at /contact linked from the nav.
CONTEXT:
- <shared CONTEXT lines>
- Lane: M. User's words: "Add a Contact page at /contact, linked from the nav."
- EXPLORE facts: route shape src/routes/about.tsx:4-8 (default export, <main class=...>, <h1>);
  nav items src/components/Nav.tsx:13-15 (<li class={`border-b-2 ${active("/about")} ...`}>);
  active rule src/components/Nav.tsx:5-6 (`path === location.pathname`); e2e specs: e2e/navigation.spec.ts.
- T2 facts: <A> has `end` and `activeClass` (node_modules/@solidjs/router/dist/components.d.ts:<line>);
  aria-current: <answer + source>.
- Decisions: keep the existing active() helper style; no contact form in this change.
OWNED FILES: read-only
DO NOT: edit files; plan work outside the request (no form, no footer, no styling pass).
DELIVERABLE: your Output format (criteria, task table with T-ids from T4, waves, final verification, risks, questions).
DONE WHEN:
1. 2-5 acceptance criteria, each checkable in a browser or by a command.
2. Every task has ONE objective, OWNED FILES disjoint from the other tasks in its wave, DONE WHEN ending in a
   command, and a test plan (unit | e2e | none + reason).
3. A TEST task for e2e/contact.spec.ts is included.
Report once with send_message using the Worker Report envelope.
```

## implementer (IMPLEMENT; one task, OWNED FILES only)
```text
TASK: T5 | PHASE: IMPLEMENT | AGENT: implementer
OBJECTIVE: Add a Contact link to the nav that is active on /contact.
CONTEXT:
- <shared CONTEXT lines>
- Task kind: feature. Acceptance criteria 2 and 3: the nav has a Contact link; it is active on /contact.
- Sibling pattern to copy (src/components/Nav.tsx:13-15):
  <li class={`border-b-2 ${active("/about")} mx-1.5 sm:mx-6`}>
    <a href="/about">About</a>
  </li>
- Active rule (src/components/Nav.tsx:5-6): `path === location.pathname ? "border-sky-600" : "border-transparent hover:border-sky-600"`.
- T4 (another implementer) creates src/routes/contact.tsx in parallel; do not touch it.
OWNED FILES: src/components/Nav.tsx
DO NOT: edit any other file; add dependencies; rename or restyle existing links; run `bun run format` (it rewrites every file).
DELIVERABLE: your Output format (changes, DONE WHEN ticks with evidence, tests needed, evidence).
DONE WHEN:
1. A Contact <li> after About links to "/contact" and uses active("/contact").
2. `node .agents/scripts/verify.mjs --quick` prints VERIFY: PASS.
Report once with send_message using the Worker Report envelope.
```
Bug task: add `Repro: <command> -> <failing output>` to CONTEXT and DONE WHEN "the repro now passes".
Refactor task: add `Baseline: <test command> -> <n> passed` and DONE WHEN "same <n> tests pass, same names".

## reviewer (REVIEW; fresh context; add a lens line for lane L)
```text
TASK: T6 | PHASE: REVIEW | AGENT: reviewer
OBJECTIVE: Find correctness, requirement and security gaps in the Contact page change.
CONTEXT:
- <shared CONTEXT lines>
- REQUIREMENTS (user, verbatim): "Add a Contact page at /contact, linked from the nav."
  Acceptance criteria: 1) /contact shows the heading "Contact" 2) the nav has a Contact link
  3) the link is active on /contact.
- CHANGE (not a git repo, before-state not visible): src/routes/contact.tsx (new: page with <h1>Contact</h1>);
  src/components/Nav.tsx (edit: Contact <li> added after About).
- CLAIMED VERIFICATION: T4 and T5 each `node .agents/scripts/verify.mjs --quick` -> VERIFY: PASS.
- AREAS OF CONCERN: does active() handle /contact/? does Home stay inactive on /contact?
- Checklist: .agents/skills/orchestrate/references/review-checklist.md (sections 0-8; section 9 too when any .agents/
  file changed).
- LENS: <correctness | security | requirements> (lane L only) - report only findings for this lens.
OWNED FILES: read-only
DO NOT: edit files; review files not listed; report style preferences.
DELIVERABLE: your Output format (verdict, findings table with quoted code -> failure, Unconfirmed, Verification rerun).
DONE WHEN:
1. Both listed files are reviewed against every acceptance criterion.
2. Every finding cites path:line, quotes the code and names a concrete failing input.
3. `node .agents/scripts/verify.mjs --quick` rerun and its VERIFY line quoted.
Report once with send_message using the Worker Report envelope.
```
Targeted re-check (after a FIX): OBJECTIVE "Confirm findings <#> are fixed at <path:line ranges>"; CONTEXT pastes
the original findings and the fixer's "Re-review focus"; DONE WHEN "each finding RESOLVED or NOT RESOLVED".

## security-auditor (REVIEW; security surface only; other scenario)
```text
TASK: T22 | PHASE: REVIEW | AGENT: security-auditor
OBJECTIVE: Audit the new POST /api/contact server function for injection, abuse and data exposure.
CONTEXT:
- <shared CONTEXT lines>
- SCOPE: src/routes/api/contact.ts (new, 42 lines) and src/lib/mail.ts:1-30 (called by it). Snippets: <paste>.
- What it protects: the SMTP credentials in env var SMTP_PASSWORD; the inbox from spam.
- Known concerns: user-supplied "email" and "message" fields reach the mail header and body.
- NETWORK: not allowed (skip the dependency audit and say so).
- Playbook: /security-audit (.agents/skills/security-audit/SKILL.md), steps 1-6 and 8.
OWNED FILES: read-only
DO NOT: edit files; run the app; send code or data to any external service.
DELIVERABLE: your Output format (threat model, findings SEC-n with source -> sink evidence, needs confirmation, not checked).
DONE WHEN:
1. Every entry point in SCOPE has an authentication/authorization and input-validation finding or "ok" with path:line.
2. Each finding quotes the source -> sink path with path:line.
3. `node .agents/skills/security-audit/scripts/secrets-scan.mjs src` run and its summary quoted.
Report once with send_message using the Worker Report envelope.
```

## fixer (FIX; exactly the listed findings)
```text
TASK: T7 | PHASE: FIX | AGENT: fixer
OBJECTIVE: FIX ROUND 1 of T5: apply review finding 1 from T6 to src/components/Nav.tsx.
CONTEXT:
- <shared CONTEXT lines>
- APPLY findings (from T6, confirmed by the orchestrator):
  1. major - src/components/Nav.tsx:6 - `path === location.pathname` -> a user who opens /contact/ (served
     by the same route) sees no active link. Fix direction: strip one trailing "/" from pathname (except
     for "/") before comparing.
- Must not change: link order, classes, the Home and About items, the default export.
- Failed check output: none (verify --quick passed; the finding is logical).
OWNED FILES: src/components/Nav.tsx
DO NOT: fix anything not listed; edit other files; refactor active() beyond the finding.
DELIVERABLE: your Output format (per finding FIXED | CANNOT FIX, check output, Re-review focus).
DONE WHEN:
1. Finding 1 is FIXED: on /contact/ active("/contact") returns "border-sky-600".
2. "/" still matches only the Home link.
3. `node .agents/scripts/verify.mjs --quick` prints VERIFY: PASS.
Report once with send_message using the Worker Report envelope.
```

## debugger (FIX, diagnosis first; also EXPLORE for bugs; other scenario)
```text
TASK: T23 | PHASE: FIX | AGENT: debugger
OBJECTIVE: Find the root cause of the failing Counter unit test.
CONTEXT:
- <shared CONTEXT lines>
- SYMPTOM: `bun run test` -> exit 1; "Counter > increments on click: expected 'Clicks: 1', received 'Clicks: 0'".
- REPRO: `bunx vitest run src/components/Counter.test.tsx` (fails every run).
- Suspected area: src/components/Counter.tsx:5-12, src/components/Counter.test.tsx. Snippets: <paste>.
- Recent change: T2 (implementer) edited Counter.tsx:9 onClick handler.
- APPLY_FIX: no. You may add a failing regression test if none exists.
OWNED FILES: src/components/Counter.test.tsx (regression test only)
DO NOT: edit src/components/Counter.tsx; add retries, sleeps or skipped tests; loosen an assertion.
DELIVERABLE: your Output format (repro, <= 3 ranked hypotheses with experiments, root cause path:line, proposed diff).
DONE WHEN:
1. The failure is reproduced with the command output quoted (or NOT REPRODUCED with every attempt).
2. One hypothesis is confirmed and the others refuted, each by a quoted experiment output.
3. Root cause is one sentence with path:line; any temporary instrumentation is removed.
Report once with send_message using the Worker Report envelope.
```
Then brief a `fixer` with the debugger's root cause and proposed diff as its APPLY finding (or set `APPLY_FIX: yes`
and give the production file in OWNED FILES when the fix is one small, obvious change).

## test-engineer (TEST; non-browser only)
```text
TASK: T9 | PHASE: TEST | AGENT: test-engineer
OBJECTIVE: (new behaviour) Prove with unit tests that the nav marks exactly one link active for /, /about, /contact and /contact/.
CONTEXT:
- <shared CONTEXT lines>
- Code under test: src/components/Nav.tsx (after T7): <paste the 20 lines>.
- Framework: vitest + @solidjs/testing-library + jsdom (vitest.config.ts; tests next to code, src/**/*.test.tsx).
  Sibling test to copy: src/components/Counter.test.tsx.
- Level: unit. Playbook: /write-tests.
OWNED FILES: src/components/Nav.test.tsx (new)
DO NOT: edit production files; skip, weaken or delete existing tests; add dependencies.
DELIVERABLE: your Output format (framework, files, cases with pass/FAIL, commands with output, code bugs found).
DONE WHEN:
1. Cases: /, /about, /contact, /contact/ each assert which link has "border-sky-600".
2. `bun run test` exits 0 and the new tests appear in its output.
3. A code bug found is reported under "Code bugs found", never worked around in the test.
Report once with send_message using the Worker Report envelope.
```
Challenger variant (lane L, extra agent, same TEST phase): OBJECTIVE "Break <function/flow> with adversarial
edge cases"; CONTEXT lists the acceptance criteria and the inputs already tested; DONE WHEN "at least 6 edge cases
(empty, max, unicode, negative, concurrent, malformed) each pass or are reported as a code bug".

## e2e-tester (TEST; browser flows with Playwright)
```text
TASK: T10 | PHASE: TEST | AGENT: e2e-tester
OBJECTIVE: Prove in a real browser that /contact renders and the Contact nav link navigates there and is active.
CONTEXT:
- <shared CONTEXT lines>
- Acceptance criteria: 1) /contact shows the heading "Contact" 2) the nav has a Contact link 3) it is active on /contact.
- Changed: src/routes/contact.tsx (new), src/components/Nav.tsx:5-7, 16-18.
- Playwright config: playwright.config.ts (Chromium, port 3000). Sibling spec: e2e/navigation.spec.ts.
- Run: `bun run test:e2e --reporter=list e2e/contact.spec.ts`. Stop any server on port 3000 first
  (a running one is reused and NOT rebuilt). Playbook: /e2e-test.
OWNED FILES: e2e/contact.spec.ts (new)
DO NOT: edit src/ or other specs; use sleeps or CSS-class locators where a role locator works.
DELIVERABLE: your Output format (specs, scenarios, commands, flake check, product bugs, setup needed).
DONE WHEN:
1. Each acceptance criterion has a scenario using role locators and web-first assertions.
2. The spec passes, and passes again with `--repeat-each=3`.
3. The full `bun run test:e2e --reporter=list` passes (no other spec broken).
Report once with send_message using the Worker Report envelope.
```

## scribe (LEARN; always last)
```text
TASK: T11 | PHASE: LEARN | AGENT: scribe
OBJECTIVE: Record what this pipeline taught the kit, or report "nothing new".
CONTEXT:
- Workspace root: J:/work/solid-app. Environment: Windows, PowerShell, `python` not `python3`, pm = bun.
- Lesson candidates (verbatim from reports):
  - T7 fixer: "When comparing router paths, strip one trailing slash, because useLocation keeps it."
  - T10 e2e-tester: "When port 3000 is busy before e2e, stop that server first, because Playwright reuses it unrebuilt."
- FIX rounds: T5 1 round - cause: trailing slash not normalized in active() (Nav.tsx:6).
- User corrections: none. Checks that failed then passed: none.
- Lessons searched in EXPLORE: L-0009 (use the lockfile's package manager) - helpful.
- New project facts: route src/routes/contact.tsx = /contact; spec e2e/contact.spec.ts.
- Guide or skill statements proved wrong: none.
OWNED FILES: .agents/memory/lessons.md, .agents/rules/90-lessons.md, AGENTS.md
DO NOT: edit code, tests or other kit files; add a lesson without a "because"; duplicate an existing lesson (search first).
DELIVERABLE: your Output format (Learn Report).
DONE WHEN:
1. Each candidate is added, voted onto an existing lesson, or rejected with a reason.
2. AGENTS.md Layout lists the new route, or "no change" with a reason.
3. `node .agents/scripts/doctor.mjs --quiet` shows no errors in your files.
Report once with send_message using the Worker Report envelope.
```

## advisor (consult: plan critique, stuck, conflict, final audit; other scenario)
```text
TASK: T24 | PHASE: CONSULT | AGENT: advisor
OBJECTIVE: PREPARE consult: critique the lane-L plan for moving sessions from cookies to a database table.
CONTEXT:
CONSULT TYPE: plan review          (or: conflict resolution | judgment call | stuck | final taste pass)
TASK AND SUCCESS CRITERIA: <deliverable + the numbered acceptance criteria + budget: FIX rounds, consults used>
QUESTION: Which step is most likely to fail or lose data, and what would you change?
MATERIAL: <the planner's full task table, the EXPLORE facts with path:line, the workspace root and paths you may read>
OWNED FILES: read-only
DO NOT: edit files; restate the material; praise.
DELIVERABLE: at most 300 words: VERDICT, TOP RISKS (ranked), SPECIFIC FIXES (numbered), WHAT TO IGNORE.
DONE WHEN:
1. Every risk points at a plan step or path:line.
2. Every fix is concrete enough to paste into a brief.
Report once with send_message using the Worker Report envelope.
```

## ESCALATE consult (after 2 failed FIX rounds or conflicting reports)
```text
TASK: T15 | PHASE: CONSULT | AGENT: advisor
OBJECTIVE: FIX consult: decide how to unblock T5 after two failed FIX rounds.
CONTEXT:
CONSULT TYPE: stuck
TASK AND SUCCESS CRITERIA: T5 "Contact link active on /contact/"; criterion 3; FIX rounds used 2/2.
QUESTION: Is the fix direction wrong, the criterion wrong, or the task mis-scoped? What is the next brief?
MATERIAL:
- Round 1 (T7): finding, change, result: <paste fixer report lines + reviewer re-check>
- Round 2 (T13): <same>
- Current code src/components/Nav.tsx:1-20: <paste>
- Conflicting evidence: <reviewer says X at path:line; e2e-tester says Y with output>
OWNED FILES: read-only
DO NOT: edit files; propose a third identical fix.
DELIVERABLE: VERDICT (APPROVE | APPROVE WITH FIXES | REVISE | STOP - needs user), TOP RISKS, SPECIFIC FIXES, WHAT TO IGNORE.
DONE WHEN:
1. The verdict names one next action: a new brief (which agent, which objective) or a user question.
Report once with send_message using the Worker Report envelope.
```
Then: apply the advisor's next action as a NEW task (new T-id), re-state the lane as L, or `ask_question` the user.

## FIX brief (always a fresh dispatch, never "try again")
Copy the failed task's brief, give it a new T-id, change TASK, OBJECTIVE, CONTEXT and narrow DONE WHEN
(the guard denies a brief without OWNED FILES or DONE WHEN):
```text
TASK: <new T-id> | PHASE: <FIX for fixer; otherwise the failed task's own phase> | AGENT: <fixer for code
      findings; the failed worker type for a non-writer re-dispatch>
OBJECTIVE: FIX ROUND <1|2> of <old T-id>: <the one failed outcome>.
CONTEXT: <original CONTEXT, plus:>
- Failed criterion: "<quote the DONE WHEN line>"
- Observed: <exact failure: command + output lines, or path:line + what is wrong>
- Keep: <parts that passed and must not change>
OWNED FILES / ALLOWED COMMANDS / DO NOT / DELIVERABLE: <copied from the original brief>
DONE WHEN: <the original list, narrowed to the failed criterion>
Report once with send_message using the Worker Report envelope.
```
Name the failure; never write "fix the issues". An implementer re-dispatch keeps `PHASE: IMPLEMENT` (its contract
expects it); an explorer keeps `PHASE: EXPLORE`. The FIX ROUND still counts toward the limit of 2. A FIX of a worker that was not a writer (for example an explorer
that cited wrong lines) is the same brief re-dispatched with the Observed line added.

## Status board (in every message after a dispatch or verdict)
```text
Lane: M - 3 files, new route — Type: feature — Acceptance criteria: 1) ... 2) ... 3) ...
| T-id | Phase | Agent(s) | Objective | Owned files | Status | Evidence |
|---|---|---|---|---|---|---|
| T4 | IMPLEMENT | implementer | create /contact page | src/routes/contact.tsx | PASS | verify --quick PASS (rerun) |
| T5 | IMPLEMENT | implementer | add Contact nav link | src/components/Nav.tsx | FIX | T6 finding 1 |
| T7 | FIX | fixer | T7 FIX of T5, round 1 | src/components/Nav.tsx | DISPATCHED id=<childId> | - |
Waiting on: 1 worker(s). FIX rounds: T5=1. Advisor consults: 0/4.
Next: T7 PASS -> T8 targeted reviewer on Nav.tsx:4-9 -> W7 (T9 test-engineer + T10 e2e-tester).
```

## Common failure modes and counters
| Failure | Counter |
|---|---|
| You answer before a worker reports | End the turn after dispatching; resume on the `sender=` message |
| Worker invents paths or commands | Paste the layout, snippets and exact commands into CONTEXT |
| Two writers clobber one file | Disjoint OWNED FILES per wave; each shared file belongs to one task |
| Worker wanders outside the repo | "Stay inside <root>" in CONTEXT; DO NOT lists forbidden paths |
| Worker does a second thing "while there" | One objective; DO NOT names the neighbours; OUT OF SCOPE goes to a new task |
| Silent partial pass | One verdict per report; rerun its command; open a cited line |
| Retry with the same brief | FIX brief quotes the failed criterion and output; 2 rounds max, then ESCALATE |
| Averaging conflicting results | Pick one or reconcile with a reason; else advisor consult |
| You edit "just one line" yourself | Lane S: one implementer + one reviewer is cheap; the guard denies your edit |
