# Lock safety per engine

Checked against the official docs in 2026-09: PostgreSQL `ALTER TABLE` (current docs), MySQL 8.4 "Online DDL
Operations", SQLite "ALTER TABLE". Engine versions matter. Check the server version first
(`SELECT version();`, `SELECT VERSION();`, `sqlite3 --version`) and re-read the docs for anything marked
"version-dependent".

## PostgreSQL

Most `ALTER TABLE` forms take an ACCESS EXCLUSIVE lock, which blocks reads AND writes. A brief ALTER that has
to WAIT for that lock (behind a long transaction) also blocks every query queued behind it. So:

```sql
SET lock_timeout = '5s';        -- fail fast instead of stalling the app; retry later
SET statement_timeout = '15min'; -- upper bound for long validations/backfills (adjust)
```

| change | risk | safe pattern |
|---|---|---|
| `ADD COLUMN` nullable, no default | metadata-only | safe |
| `ADD COLUMN ... DEFAULT <constant>` | metadata-only in modern versions (the default is stored in the catalog) | safe; a VOLATILE default (for example a random or clock function) rewrites the table: add it nullable, then backfill |
| `ALTER COLUMN ... TYPE` | "will normally cause the entire table and its indexes to be rewritten" | expand/contract: new column, dual-write, backfill, switch, drop. Some binary-compatible changes skip the rewrite (version-dependent; check the docs) |
| `SET NOT NULL` | scans the whole table under the exclusive lock | `ADD CONSTRAINT c CHECK (col IS NOT NULL) NOT VALID;` then `VALIDATE CONSTRAINT c;` then `ALTER COLUMN col SET NOT NULL;` (the scan is skipped when a valid CHECK proves no NULLs), then `DROP CONSTRAINT c;` |
| add a `FOREIGN KEY` / `CHECK` | scans the table | `ADD CONSTRAINT ... NOT VALID;` then, in a separate step, `VALIDATE CONSTRAINT ...;` (validation takes only SHARE UPDATE EXCLUSIVE) |
| `CREATE INDEX` | blocks writes for the whole build | `CREATE INDEX CONCURRENTLY ...`. It cannot run inside a transaction block, so mark the migration non-transactional (see orm-commands.md). If it fails, it leaves an INVALID index: `DROP INDEX CONCURRENTLY` it and retry |
| add a `UNIQUE` constraint | index build under lock | `CREATE UNIQUE INDEX CONCURRENTLY idx ON t (col);` then `ALTER TABLE t ADD CONSTRAINT t_col_key UNIQUE USING INDEX idx;` |
| `RENAME COLUMN` / `RENAME TABLE` | fast, but breaks running app code | expand/contract (or a view/alias during the transition) |
| `DROP COLUMN` | fast, but breaks code that still selects it | stop reading and writing it in one release (Rails: `ignored_columns`), drop it in the next |
| `ALTER TYPE ... ADD VALUE` (enum) | has transaction restrictions | run it outside the migration transaction (Alembic: `op.get_context().autocommit_block()`) |
| large `DELETE` / `UPDATE` | long locks, bloat, replication lag | batches by primary key (SKILL.md step 6) |

## MySQL / MariaDB (InnoDB)

- DDL causes an implicit COMMIT, so a migration with several DDL statements is NOT atomic. A failure halfway
  leaves a partial schema. Put one DDL change in each migration and make downs tolerate partial state.
- Always state the algorithm and lock, so an unsupported operation ERRORS instead of silently copying the
  table: `ALTER TABLE t ADD COLUMN c INT NULL, ALGORITHM=INSTANT;` or
  `ALTER TABLE t ADD INDEX idx_c (c), ALGORITHM=INPLACE, LOCK=NONE;`
- Metadata locks: an ALTER waits behind open transactions on the table and blocks the queries queued after
  it. Set `SET SESSION lock_wait_timeout = 10;` and retry off-peak.

| change | 8.4 docs say | safe pattern |
|---|---|---|
| add a column | `INSTANT` "can add a column at any position" (older 8.0 releases: last position only, version-dependent) | `ALGORITHM=INSTANT`; each INSTANT add/drop creates a row version (max 64; 255 as of 9.1), after which a rebuild is needed |
| drop a column | `ALGORITHM=INSTANT` supported | stop using it in the app first |
| rename a column | online when the type and NULL-ness stay the same (`CHANGE old new <same type>, ALGORITHM=INSTANT`) | still expand/contract for running app instances |
| change the data type | "only supported with `ALGORITHM=COPY`" (blocks writes) | expand/contract, or an online schema tool (gh-ost, pt-online-schema-change) for big tables |
| add a secondary index | in place, the table stays readable and writable | `ALGORITHM=INPLACE, LOCK=NONE` |
| add a unique index | fails on duplicates | query for duplicates first; clean up in a data migration |
| add a foreign key | needs a matching index; checks data | create the index first; do it off-peak |

Backfill note: MySQL rejects `LIMIT` inside an `IN (SELECT ...)` subquery and updates that select from the same
table. Batch by primary-key range (`WHERE id BETWEEN ? AND ?`) instead.

## SQLite

- One writer at a time. Every write transaction locks the whole database, so keep batches short. WAL mode
  (`PRAGMA journal_mode=WAL;`) lets readers continue during writes.
- Supported `ALTER TABLE` forms: `RENAME TABLE`, `RENAME COLUMN` (3.25.0+), `ADD COLUMN`, `DROP COLUMN` (3.35.0+).
- `ADD COLUMN` restrictions: no PRIMARY KEY/UNIQUE; no `CURRENT_TIMESTAMP`-style or parenthesized-expression
  default; NOT NULL needs a non-NULL default; with foreign keys on, a REFERENCES column needs a NULL default;
  no `GENERATED ALWAYS ... STORED`.
- Everything else (retype, add a constraint, reorder) uses the documented table-rebuild procedure:
  ```sql
  PRAGMA foreign_keys=OFF;          -- outside the transaction
  BEGIN TRANSACTION;
  CREATE TABLE new_t (...);         -- the desired schema, created under a TEMPORARY name
  INSERT INTO new_t (cols) SELECT cols FROM t;
  DROP TABLE t;
  ALTER TABLE new_t RENAME TO t;    -- rename the new table; never rename the old table away first
  -- recreate indexes, triggers and views that referenced t
  PRAGMA foreign_key_check;         -- must return no rows
  COMMIT;
  PRAGMA foreign_keys=ON;
  ```
  Prisma and Drizzle generate this rebuild for SQLite automatically. Read it before applying: check that every
  column is copied and the indexes are recreated.
- Backup: `sqlite3 app.db ".backup backup.db"` or `VACUUM INTO 'backup.db';`

## Universal rules

1. The running app version must work with BOTH the old and the new schema during a deploy.
2. Add before you remove. Remove only after a full release has shipped without using the old thing.
3. Keep schema changes and big data changes in separate migrations.
4. Time risky steps on a copy with production-like row counts before shipping them.
