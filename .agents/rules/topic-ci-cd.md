---
trigger: model_decision
description: "Apply when creating or editing CI/CD or release automation: GitHub Actions (.github/workflows/*.yml), GitLab CI, Azure Pipelines, CircleCI, Jenkinsfile, deploy or release scripts."
---
# CI/CD pipelines - topic rule
Principles guides: `.agents/guides/principles/security.md` (supply chain, secrets) and `.agents/guides/principles/dependency-management.md`. Security review of a pipeline: `/security-audit`. Container builds: `topic-docker.md`. (Workflow files cannot be matched by basename globs, so this rule is opened by description.) Workers edit CI files only when the brief names them (00 safety tier).

## Protocol
1. Read the existing pipelines and the project's own check commands (package.json scripts, Makefile, `node .agents/scripts/verify.mjs --list`). CI runs the same commands developers run locally.
2. Order jobs fast -> slow and fail fast: install (frozen lockfile) -> format/lint -> typecheck -> unit tests -> build -> e2e -> deploy. Deploy depends on every check and runs only from the protected branch or a tag.
3. Reproducible installs: `npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable`, `bun install --frozen-lockfile`, `uv sync --locked`, `cargo build --locked`, `go mod download` with a committed `go.sum`.
4. Cache package-manager stores keyed by the lockfile hash: the setup action's built-in `cache` input where it has one, or `actions/cache` with `hashFiles('<lockfile>')`. Never share build outputs across branches without the source in the key.
5. Give every job `timeout-minutes`, and PR workflows a `concurrency` group with `cancel-in-progress: true` (never cancel a running deploy).
6. Validate locally: `actionlint` if installed, otherwise at least a YAML parse, and run the step commands locally.
7. Pushing and reading CI job logs happen only when the user asks (orchestrator); a worker reports the local validation only, never "CI green".

## Invariants (MUST / NEVER - with reason -> alternative)
1. MUST set least-privilege token permissions at the workflow top (`permissions: contents: read`) and raise them per job only where needed - otherwise the token may have write access to the repository.
2. MUST pin third-party actions to a full-length commit SHA with a version comment (`uses: owner/action@<40-hex-sha> # v1.2.3`) - tags are mutable, and GitHub documents SHA pinning as the only immutable reference. Take the SHA from the brief's CONTEXT (a `docs-researcher` looks it up in EXPLORE). NEVER invent a SHA; not given -> keep the tag, add `TODO: pin to SHA`, and report `INPUT GAP:`.
3. NEVER interpolate untrusted event data (`${{ github.event.pull_request.title }}`, branch names, issue or comment bodies) inside `run:` - script injection. Instead: pass it through `env:` and use `"$TITLE"`.
4. NEVER check out or run pull-request code in `pull_request_target` (or privileged `workflow_run`) jobs - they run with secrets and write access. Instead: `pull_request` for untrusted code.
5. NEVER echo secrets or pass them as command-line arguments. Prefer OIDC federation to cloud providers over long-lived keys; put deploy secrets in protected environments with required reviewers.
6. Deploys are idempotent and have a written rollback step. Production needs environment approval.

## Pitfalls Flash models get wrong
- `actions/checkout@main` or `@latest` (unpinned, mutable).
- `permissions: write-all`, or no `permissions` key at all.
- Caching `node_modules` across OS or Node versions instead of the package-manager store.
- Running `npm install` (rewrites the lockfile) instead of the frozen install.
- Using `on: push` for every branch plus `pull_request` - duplicate runs.

## Example - bad -> good
```yaml
# BAD
on: [push, pull_request]
permissions: write-all
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@main
      - run: echo "Testing ${{ github.event.pull_request.title }}"
      - run: npm install && npm test

# GOOD (example for a bun project: use the project's own package manager and scripts)
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@<full-sha> # vX.Y.Z (look up the SHA)
      - uses: oven-sh/setup-bun@<full-sha> # vX.Y.Z
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run typecheck
      - run: bun run test
      - run: bun run build
      - env:
          TITLE: ${{ github.event.pull_request.title }}
        run: echo "Checking PR $TITLE"
```

## Before finishing
- [ ] `permissions` set, actions pinned (or TODO-marked), no `${{ }}` of untrusted data inside `run:`
- [ ] Frozen installs, lockfile-keyed caches, `timeout-minutes`, concurrency set
- [ ] Validated (actionlint or YAML parse) and the commands ran locally; say which
