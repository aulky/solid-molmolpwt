---
name: security-audit
description: Runs a security review of a scope or the whole repo - builds a threat model, checks it against the OWASP Top 10:2025 and API Security Top 10:2023 per stack, scans for committed secrets, runs each ecosystem's native dependency-vulnerability audit, and reports every finding with an ID, severity, evidence and fix. Use when asked to audit, review or harden security, before a release, or for any change touching auth, sessions, tokens, crypto, file upload, user-supplied URLs/HTML, SQL, shell execution or secrets.
metadata:
  icon: 🛡️
---

# Security audit: threat model, OWASP checklist, secrets, dependencies, evidence-based findings

Used by: `security-auditor` (REVIEW phase, and read-only audit tasks) runs steps 1-8 (step 9: it never fixes). The orchestrator uses
"Orchestrator: planning an audit" below to scope and dispatch audits; it never runs the audit steps itself.

A finding is real only when you traced untrusted input to a harmful effect and can quote `path:line`. "Looks
risky" without a trace goes under Needs confirmation, not Findings.

## When to use
- "Security audit / review", "is this safe", "harden this", before a release or exposing something publicly.
- A REVIEW-phase brief for the `security-auditor` on a task's change or the integrated diff.
- Any change touching authentication, sessions, tokens, crypto, file upload, user-supplied URLs/HTML/paths,
  SQL/shell built from strings, deserialization, or secrets (also required by `rules/topic-security-sensitive.md`).
- A dependency-vulnerability sweep, or a secrets-leak check before a commit/PR.

Do NOT use for:
- General code review (correctness, style, tests) -> the `reviewer` worker and
  `.agents/skills/orchestrate/references/review-checklist.md`.
- Manifest hygiene (unpinned deps, duplicate majors) with no CVE claim -> `.agents/rules/topic-dependencies.md`
  and `.agents/guides/principles/dependency-management.md`; changes go through `/upgrade-deps`.
- Applying a fix or a dependency bump the audit recommended -> a new IMPLEMENT/FIX task (orchestrator), and
  `/upgrade-deps` for bumps. The auditor never edits files.

## Orchestrator: planning an audit (you dispatch; you do not audit)
1. Split the request into scopes of one entry-point area each (for example `src/routes/api/`, auth/session
   code, upload handling); max 3 `security-auditor` workers per wave.
2. Ask the user once whether dependency names/versions may be sent to registries. Put `NETWORK: allowed` or
   `NETWORK: not allowed` in every brief.
3. Brief each worker with `.agents/skills/orchestrate/references/briefs.md` §security-auditor: SCOPE, assets,
   known concerns, "Playbook: /security-audit steps 1-8", `OWNED FILES: read-only`.
4. Grade each report: open 1-2 cited `path:line` per APPLY finding and confirm the source -> sink trace.
5. Merge: one row per location (same `path:line` from two workers -> keep the higher severity and both
   evidences, never average). Audit-only request: report the merged table and ask which findings to fix.
   Fixing: plan per `.agents/skills/orchestrate/references/task-types.md` §security (one task per SEC-id).

## Checklist
Copy this and tick items as you go:
```
- [ ] Scope stated: paths/diff audited, what is out of scope and why
- [ ] Threat model: entry points, assets, trust boundaries (1 line each)
- [ ] OWASP Top 10:2025 walked (references/owasp-checklist.md); API Top 10:2023 walked if it exposes an API
- [ ] Stack-specific sink patterns searched (search.mjs / security-auditor's sink list)
- [ ] Every hit traced to source or dismissed with a one-line reason
- [ ] Secrets scan run; every match masked, never printed in full
- [ ] Dependency audit run per ecosystem (or SKIP reason recorded - network permission, tool missing)
- [ ] Findings rated (critical/high/medium/low/info) with evidence and a fix
- [ ] Report written; nothing above "no findings above low" claimed without the searches to back it
```

## Procedure
1. **Scope + threat model.** State the paths or diff in scope. List entry points (HTTP routes, server
   functions, CLI args, file uploads, webhooks, message consumers, env/config), assets (credentials, PII,
   money, admin actions) and trust boundaries (browser<->server, service<->service, process<->filesystem).
   One line each; if the input is unclear, start with `INPUT GAP: <what you assumed>` and continue.
2. **Walk the checklist for the stack.** [references/owasp-checklist.md](references/owasp-checklist.md) has
   the OWASP Top 10:2025 categories, the API Security Top 10:2023 (only if this scope exposes an API), and a
   per-stack "where to look" row (Node/Express, Next/SolidStart, Django/Flask/FastAPI, Laravel, Spring, ASP.NET,
   Rails, Go). For each category: does it apply here, and if so, checked how.
3. **Search for sinks.** `node .agents/scripts/search.mjs "<regex>" <path> -i` (or `grep_search` if the script
   is missing). Categories and patterns: secrets/keys, code execution (`eval`, `exec`, `spawn` with
   `shell: true`), SQL/shell built from string concatenation, HTML injection (`innerHTML`,
   `dangerouslySetInnerHTML`, `v-html`, `|safe`), SSRF/path handling (`fetch`, `readFile`, `path.join` with
   user input), weak crypto (`md5`, `sha1`, `Math.random` for tokens), cookie/CORS flags, deserialization
   (`pickle.loads`, `yaml.load`, `unserialize`, `ObjectInputStream`, `BinaryFormatter`). The full list and
   per-stack additions are in the checklist reference.
4. **Trace every hit.** View it; follow the value back to where it entered the trust boundary. Report only
   when untrusted input reaches the sink without validation, escaping, parameterization or authorization -
   or a secret is real (not a placeholder, env-var reference or test fixture). Everything else: one line
   under Needs confirmation or dismissed with the reason.
5. **Access control**, for each server entry point in scope: is there authentication, an authorization check
   for the SPECIFIC object (not just "logged in" - the classic broken-object-level-authorization gap), input
   validation at the boundary, and an error response that does not leak internals (stack traces, SQL, paths).
6. **Secrets scan.**
   `node .agents/skills/security-audit/scripts/secrets-scan.mjs [path]` (add `--history` once, in a git repo,
   to check past commits too). It masks every value it finds - never re-print a full secret in your report or
   anywhere else. A `.env*` file with real values, or a tracked key/credential file, is high severity even
   with no pattern match.
7. **Dependency audit.** Only when the brief or the user allows sending dependency names/versions to a
   registry (this leaves the workspace):
   `node .agents/skills/security-audit/scripts/dep-audit.mjs [path]` (add `--list` first to preview the plan
   without running anything, `--only <eco,..>` to restrict, `--prod` for production deps only). It auto-picks
   `bun audit` / `npm audit` / `pnpm audit` / `yarn audit`, `cargo audit`, `govulncheck`, `pip-audit`,
   `composer audit`, `bundle-audit`, `dotnet list package --vulnerable --include-transitive --format json`
   (needs .NET SDK 8.0+ for `--format json`), `mix deps.audit`/`hex.audit`, and `osv-scanner` when installed.
   A missing tool is SKIP with an install hint, not a failure - list it in Not checked instead of guessing a
   result. Without network permission, list the commands under Not checked and stop there.
8. **Rate, label and report.** Severity by exploitability x impact (critical, high, medium, low, info); add the
   OWASP/API category or CWE when clear. Label each finding: APPLY = critical, high or medium inside the brief's
   scope; DEFER = low, info, or outside this task. Verdict: APPROVE = no APPLY findings; REQUEST CHANGES
   otherwise. Use the template below. A scope too big for your budget: audit the highest-risk entry points
   first and list the rest under Not checked (status FAIL), never skim everything.
9. **Never fix.** This skill reports; it never edits files, because the fix needs its own REVIEW and TEST.
   Each APPLY finding carries a fix direction; the orchestrator turns it into a FIX or IMPLEMENT task
   (`.agents/skills/orchestrate/references/task-types.md` §security) and a later audit re-checks it as FIXED or OPEN.

## Output
Workers: use the Output format in `.agents/agents/security-auditor.md` exactly; it is authoritative. The block
below copies its body fields, for orchestrator or ad-hoc use. Secrets values stay masked everywhere.
```text
## security-auditor: <PASS | FAIL | BLOCKED> — <T-id>
Verdict: <APPROVE | REQUEST CHANGES> | Scope: <paths or diff>
Threat model: entry points <list>; assets <list>; trust boundaries <list>
| ID | Label | Severity | Category | Location | Evidence (quoted, source -> sink) | Fix |
|---|---|---|---|---|---|---|
Needs confirmation: <items | none>
Secrets scan: <counts, masked> | Dependency audit: <summary | SKIP: why>
Not checked: <areas or commands - why>
Evidence: <key command -> key line>
Files touched: none
Lesson candidates: <one-line "when X, do Y because Z" | none>
```
Orchestrator merging several audits: keep this shape, one table row per location (see "planning an audit" step 5).

## References
- [references/owasp-checklist.md](references/owasp-checklist.md) - OWASP Top 10:2025, API Security Top 10:2023,
  and a per-stack "where to look" table. Verified against `top10.owasp.org` and `owasp.org/API-Security` 2026-09-27.
- [scripts/secrets-scan.mjs](scripts/secrets-scan.mjs) - `--help` for all flags. Never prints a full secret.
- [scripts/dep-audit.mjs](scripts/dep-audit.mjs) - `--help` for all flags; `--list` previews without running.
- Worker contract: `.agents/agents/security-auditor.md` (same method, with budgets). Brief:
  `.agents/skills/orchestrate/references/briefs.md` §security-auditor. Pipeline changes for security work:
  `.agents/skills/orchestrate/references/task-types.md` §security.
- `.agents/rules/topic-security-sensitive.md` and `.agents/guides/principles/security.md`.
- Applying a fix the audit recommends: an IMPLEMENT/FIX task planned by the orchestrator (`/orchestrate`), then a
  `security-auditor` re-check of the changed scope in REVIEW.
