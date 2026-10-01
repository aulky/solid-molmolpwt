---
name: db-migration
description: Task-type playbook for safe database schema and data migrations run through the orchestrator pipeline. It covers expand/contract for zero-downtime changes, reversible steps, backups, batched backfills, lock-safety for Postgres/MySQL/SQLite, and the commands for Prisma, Drizzle, Laravel, Django, Rails, Alembic, EF Core, sqlx, goose and Atlas. Use when adding, renaming, dropping or retyping columns, tables, indexes or constraints, backfilling data, or generating or rolling back migrations.
metadata:
  icon: 🚚
---

# DB migration: expand/contract, reversible, backed up, lock-safe, verified on a copy

Used by: orchestrator (plans the pipeline with this playbook; default lane L); workers follow the step for
their phase - `explorer` (EXPLORE: step 1), `planner` (PREPARE: steps 2-3), `implementer` (IMPLEMENT: steps
4-6), `reviewer` (REVIEW), `test-engineer` (TEST: steps 7-8), `scribe` (LEARN).

Default: the project's existing migration tool and conventions (the migrations folder and its latest 3
migrations). Only if the project has no tool yet, pick its ORM's built-in migrator and record the choice in an
ADR (a separate docs task; the `architecture-decision-records` skill).

## When to use
- Schema changes: add, rename, drop or retype a column; add or drop a table, an index, a constraint or a foreign key.
- Data migrations and backfills; splitting or merging columns or tables; moving data between stores.
- Generating, fixing, squashing, or rolling back migrations; a migration fails in CI or in deploy.

Do NOT use for:
- Query tuning without a schema change. Use `/perf-audit` and `.agents/rules/topic-database-design.md`.
- Designing a new schema from scratch with no data yet. Use `.agents/rules/topic-database-design.md`, then this
  playbook for the first migration.
- Seed or fixture data for tests only. That is a `test-engineer` task (`/write-tests`).

## Invariants (paste the relevant ones into every IMPLEMENT and TEST brief under DO NOT)
1. NEVER run migrations, `reset`, `fresh`, `push`, `DROP` or `TRUNCATE` against production or any shared
   database, because data loss there is irreversible. Instead apply to a local, ephemeral or copy database, and
   hand the user the exact deploy commands in the Completion Report.
2. NEVER edit a migration that has already been applied anywhere shared, because other databases already ran the
   old version. Instead add a new migration (a new task).
3. Every migration is reversible (a down or revert step), or it says why not in a comment, plus how to restore
   (a backup, a forward fix).
4. A change the running app version cannot survive (rename, drop, retype, a new NOT NULL) uses expand/contract
   across separate deploys. NEVER one step.
5. Backfills run in batches, outside the schema-change transaction, and are idempotent and resumable.
6. NEVER print or commit connection strings or passwords. Refer to them by variable name (`DATABASE_URL`).
7. Destructive steps (drop, retype, anything that loses data) are asked to the user in PREPARE, before any
   IMPLEMENT dispatch, because only the user can accept data loss.

## Phase map
| Step | Phase | Worker (TypeName) | Output the gate needs |
|---|---|---|---|
| 1 Identify | EXPLORE | `explorer` (+ `docs-researcher` for engine-version lock behaviour) | engine + major version, tool, migrations dir, deploy path, status command |
| 2 Classify, 3 Plan | PREPARE | `planner` (+ `advisor` critique, lane L) | class, expand/contract phases, one task per phase, rollback per phase |
| 4 Backup | IMPLEMENT (first task) | `implementer` | backup file path + restore tested on a scratch db (risky changes) |
| 5 Write migration | IMPLEMENT | `implementer`, one migration file per task | generated, read, corrected; down step written |
| 6 Backfill | IMPLEMENT (own task) | `implementer` | batched, idempotent script or migration step |
| - Review | REVIEW | `reviewer` (+ `security-auditor` for raw SQL built from input) | lock-safety, reversibility, no current-model imports |
| 7 Verify locally | TEST | `test-engineer` | up -> status -> down -> up output; `verify.mjs` PASS |
| 8 Verify on a copy | TEST (large or risky tables) | `test-engineer` | timing on N rows under the lock timeout |
| - Learn | LEARN | `scribe` | lock or tool surprises as lesson candidates |

## Checklist (orchestrator)
Copy this and tick items as you go:
```
- [ ] Lane L stated (M only for an additive-safe change on a small table, with the reason)
- [ ] EXPLORE: engine + version, ORM/migration tool, migrations folder, deploy path, status command named
- [ ] PREPARE: change classified with references/lock-safety.md; expand/contract phases = separate tasks
- [ ] Destructive steps asked to the user; answer quoted on the board
- [ ] Backup task (or "local throwaway db: no backup needed") before any migration task
- [ ] Each migration task: generated with the tool, then READ and corrected; down step written
- [ ] Backfill is its own task: batched, idempotent, resumable
- [ ] REVIEW done with the lock-safety lens
- [ ] TEST: up -> down -> up on a local db of the SAME major version; status clean; verify.mjs PASS
- [ ] Large table: timed on a restored copy
- [ ] Completion Report has the Migration block with deploy order and rollback per phase
```

## Procedure

### EXPLORE
1. **Identify (explorer).** One `explorer` brief: find the engine and its major version (compose files,
   `.env.example`, config), the tool (`schema.prisma`, `drizzle.config.*`, `database/migrations/`,
   `*/migrations/`, `db/migrate/`, `alembic.ini`, a `Migrations/` folder, `migrations/*.sql` for
   sqlx/goose/atlas), the latest 3 migrations (naming, style), and how deploys apply migrations (CI step, on
   boot, manual). Unsure how this engine version locks -> a `docs-researcher` in the same wave.
   Gate: you can name the status command from [references/orm-commands.md](references/orm-commands.md) and the
   migrations folder `path`.

### PREPARE
2. **Classify (planner)** with [references/lock-safety.md](references/lock-safety.md) pasted or linked:
   - additive-safe: a new table, a nullable column, a column with a constant default (engine-dependent), a
     concurrent index;
   - risky: anything that rewrites the table, scans it under a strong lock, or blocks writes;
   - breaking for the running app: rename, drop, retype, a new NOT NULL or unique constraint on existing data;
   - data: a backfill or transformation.
3. **Plan (planner).** Breaking change -> expand/contract, each phase its own migration, task AND deploy:
   1. EXPAND: add the new column or table (nullable, no strong locks).
   2. DUAL-WRITE: the app writes both old and new; reads stay on old.
   3. BACKFILL: copy old to new in batches (step 6, its own task).
   4. SWITCH READS: the app reads new; verify with metrics or queries.
   5. CONTRACT: stop writing old, then drop it in a LATER release, after one release shipped without it.
   A rename is expand/contract. It is NEVER an in-place rename while old app instances run.
   Gate: every task has one objective and owns one migration file (or the backfill script, or the app code
   for dual-write); the plan lists the rollback per phase; destructive steps asked (invariant 7).

### IMPLEMENT
4. **Backup (implementer, first task).** Skip only for a local throwaway database, and say so on the board.
   Commands (credentials from env vars; never echo them):
   - Postgres: `pg_dump -Fc -f backup.dump "<url from DATABASE_URL>"`; restore test:
     `pg_restore --no-owner -d <scratch-db-url> backup.dump`
   - MySQL/MariaDB: `mysqldump --single-transaction --routines --triggers <db> > backup.sql`
   - SQLite: `sqlite3 app.db ".backup backup.db"` (or `VACUUM INTO 'backup.db'` from SQL)
   Backups go outside the repo or into a gitignored folder. Production snapshots are taken by the user or their
   platform: the step goes into the deploy commands, never into a worker brief.
5. **Write the migration (implementer, one per task).** The brief pastes:
   - Generate with the tool ([references/orm-commands.md](references/orm-commands.md)), then READ the generated
     SQL or code. Autogenerate misses renames (emits drop + add = data loss), server defaults, some constraints.
   - One concern per migration, a descriptive name (`add_orders_status_v2`).
   - The lock rules for this engine: `lock_timeout`, concurrent index creation outside a transaction,
     `NOT VALID` then `VALIDATE`, explicit `ALGORITHM`/`LOCK` on MySQL.
   - Data changes inside ORM migrations use raw SQL or the historical model API (Django `apps.get_model`),
     never current app models (they change later and break old migrations).
   - A down step that restores the previous schema; a destructive down is marked in a comment.
   DONE WHEN: the migration applies on the local db and the status command shows it applied.
6. **Backfill (implementer, its own task).** A separate script, job or migration step, not the schema transaction:
   ```sql
   -- Postgres/SQLite shape: repeat until 0 rows are affected; one transaction per batch
   UPDATE orders SET status_v2 = status
   WHERE id IN (SELECT id FROM orders WHERE status_v2 IS NULL ORDER BY id LIMIT 5000);
   ```
   MySQL does not allow `LIMIT` inside an `IN` subquery on the same table; use a PK range:
   `WHERE id BETWEEN ? AND ? AND status_v2 IS NULL`. The `IS NULL` guard makes it idempotent and resumable.
   Batches of about 1-2 s each, a pause between them, progress logged, replication lag watched.

### REVIEW
- `reviewer` with the lens "lock-safety per `references/lock-safety.md`, reversibility, invariants 1-6". Add a
  `security-auditor` when SQL is built from input or credentials appear anywhere in the diff.

### TEST
7. **Verify locally (test-engineer).** Against a local or ephemeral database of the SAME major version (for
   example `docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=dev postgres:<major>`): apply up, run the
   status command (nothing pending, no drift), apply down, apply up again; data checks (row counts, nulls)
   quoted; `node .agents/scripts/verify.mjs`; the project's migration linter if it has one (`atlas migrate
   lint`, squawk, `strong_migrations`, django-migration-linter).
   Gate: the up/down/up output and the VERIFY line are in the report; you rerun the status command.
8. **Verify on a copy (test-engineer, large or risky tables).** Restore the backup into a scratch database, run
   the migration, time it. A step longer than the lock timeout, or longer than a few seconds under a
   write-blocking lock -> back to PREPARE for a concurrent, online or batched variant.

### LEARN and REPORT
- `scribe` brief: lock behaviour or tool output that surprised a worker, autogenerate mistakes caught in REVIEW.
- You run `node .agents/scripts/verify.mjs`, then add the Migration block to the Completion Report.

## Output (Migration block inside the Completion Report)
```
### Migration
- Engine / tool: <Postgres 16 / Prisma> · migrations dir: `<path>`
- Change: <one line> · class: <additive-safe | risky | breaking | data>
- Phases (one deploy each): 1) EXPAND `<migration>` (T<id>) 2) ... 5) CONTRACT (later release)
- Lock notes: <e.g. index built CONCURRENTLY; FK added NOT VALID + VALIDATE; lock_timeout 5s>
- Backup: <command/snapshot + where> · restore tested: <yes on scratch db | n/a: local throwaway db>
- Local verification (T<id> test-engineer): up -> down -> up OK (`<status cmd>`: ...); verify.mjs -> PASS
- Copy verification: <timing on N rows | not needed because ...>
- Deploy commands (user runs): `<cmd>`
- Rollback per phase: `<cmd>` / <restore steps>
```

## References
- [references/lock-safety.md](references/lock-safety.md): what locks or rewrites in Postgres, MySQL and SQLite,
  and the safe alternatives. Paste the engine's section into planner and reviewer briefs.
- [references/orm-commands.md](references/orm-commands.md): generate, apply, status, rollback and dry-run
  commands per tool. Paste the exact commands into implementer and test-engineer briefs.
- `.agents/skills/orchestrate/references/task-types.md` (db-migration section), `.agents/rules/topic-db-migrations.md`,
  `.agents/guides/principles/database-design.md`.
