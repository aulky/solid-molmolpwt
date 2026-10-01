---
trigger: glob
globs: "**/*.sql"
description: "SQL quick card: toolchain, invariants, idioms, pitfalls. Loaded when editing .sql files."
---
# SQL — quick card
Deep guide: `.agents/guides/languages/sql.md` — read before non-trivial SQL work (new query, index, migration, transaction).
Principles: `.agents/guides/principles/database-design.md`, `.agents/guides/principles/performance.md`, `.agents/guides/principles/security.md`, `.agents/guides/principles/concurrency.md`

## Toolchain (use the project's own config first)
- Lint: `sqlfluff lint <path>` · Format: `sqlfluff format <path>` (`sqlfluff fix <path>` = full ruleset) — no verify.mjs stack; run sqlfluff directly
- Set the dialect once in `.sqlfluff` (`dialect = postgres|mysql|mariadb|tsql|sqlite`) — read the project's connection config/migration tool first, don't guess.

## Invariants (MUST / NEVER — with reason → alternative)
1. NEVER concatenate or template a value into a SQL string — injection. Bind every value as a parameter (`$1` Postgres, `?` MySQL/MariaDB/SQLite, `@p1` SQL Server), even "internal" ones.
2. NEVER compare to NULL with `=`/`!=`, and NEVER use `NOT IN (subquery)` on a nullable column — three-valued logic makes `x = NULL` UNKNOWN, so rows silently vanish, and one NULL in the subquery makes `NOT IN` return zero rows. Use `IS [NOT] NULL`, `IS [NOT] DISTINCT FROM`, or `NOT EXISTS (...)`.
3. NEVER paginate past page 1 with `OFFSET n` on a large table — it still scans and discards `n` rows, and rows can shift between requests. Use keyset pagination: `WHERE (sort_col, id) < (?, ?) ORDER BY sort_col DESC, id DESC LIMIT ?` (SQL Server: no row-value compare — expand: `sort_col < ? OR (sort_col = ? AND id < ?)`).
4. NEVER run related writes without a transaction — a crash mid-way leaves inconsistent data. Wrap them in `BEGIN ... COMMIT`, roll back on error, keep it short.
5. NEVER add/change an index without checking existing ones and the query's `WHERE`/`JOIN`/`ORDER BY` columns — wrong composite order (equality columns first, range/sort last) makes it unusable; a redundant one only slows writes. Check with `EXPLAIN`/`\d`/`SHOW INDEX` first.
6. NEVER rely on app code alone (or `SELECT` then `INSERT`) for uniqueness/relationships — concurrent requests bypass it. Enforce `UNIQUE`/`CHECK`/`NOT NULL`/FK in the schema; use an upsert (`ON CONFLICT`/`ON DUPLICATE KEY`/`MERGE`) for check-then-write races.
7. NEVER hand-edit an applied migration — it drifts from what's deployed. Add a new migration; for a breaking change use expand/contract (add nullable → backfill → enforce).
8. NEVER assume one dialect's syntax works elsewhere — upsert, pagination, `RETURNING`, `MERGE`, quoting, auto-increment all differ. Confirm the target first.

## Idioms & pitfalls Flash models get wrong
- `JOIN` for columns from both tables; `EXISTS`/`NOT EXISTS` for a membership/anti-join check — short-circuits and avoids the `NOT IN`/NULL trap above.
- Window functions (`SUM(...) OVER (PARTITION BY ... ORDER BY ...)`, `ROW_NUMBER()`, `RANK()`) keep one row per input; `GROUP BY` collapses rows. Use a window function for detail row + running total/rank together.
- A `WITH` CTE is for readability/recursion, not a materialization fence — Postgres/MySQL/MariaDB/SQLite/SQL Server all inline a non-recursive CTE.
- Covering index: add the `SELECT` columns too (`INCLUDE` in Postgres/SQL Server; append to the key elsewhere) for an index-only scan.
- Partial index (`WHERE status = 'pending'` on the index) works in Postgres/SQLite only; MySQL/MariaDB have no equivalent (SQL Server's filtered index is close but separate syntax).
- A function around an indexed column blocks index use: `WHERE DATE(created_at) = ?` can't use an index on `created_at` — rewrite as a range.
- Isolation defaults differ: Postgres/SQL Server → READ COMMITTED; MySQL/MariaDB → REPEATABLE READ. Pick per-transaction for the anomaly to prevent, don't raise it everywhere.
- `SELECT ... FOR UPDATE` / `WITH (UPDLOCK, ROWLOCK)` locks rows for read-modify-write; lock rows in the same order everywhere or you get deadlocks.
- SQLite: one writer at a time; enable `PRAGMA journal_mode=WAL;` so readers don't block it, and retry `SQLITE_BUSY`.
- `RETURNING` exists in Postgres, SQLite (3.35+) and MariaDB; plain MySQL has none — use a follow-up `SELECT` or `LAST_INSERT_ID()`.
- Batch bulk writes in one transaction / multi-row `INSERT ... VALUES (...), (...)` — many autocommits are dominated by commit overhead.

## Example — bad → good
```text
# BAD (pseudocode, not SQL): app-code string concat -> injection
# "SELECT * FROM orders WHERE customer_email = '" + email + "' ORDER BY created_at DESC LIMIT 20 OFFSET 100000"
```
```sql
-- GOOD: bound parameter, keyset pagination from the last row's cursor
-- $1 Postgres, ? MySQL/MariaDB/SQLite; not SQL Server (#3)
SELECT id, created_at, total_cents, status
FROM orders
WHERE customer_email = $1
  AND (created_at, id) < ($2, $3)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

## Before finishing
- [ ] every value bound as a parameter; no `= NULL`/`NOT IN` on a nullable column · [ ] `EXPLAIN` checked; touched columns indexed, right composite order
- [ ] multi-statement writes in a transaction · [ ] pagination beyond page 1 is keyset, not `OFFSET` · [ ] `UNIQUE`/`CHECK`/FK enforce it at schema level, not app code only
- [ ] migration is a new file, never an edited applied one · [ ] `sqlfluff lint`/`format` clean
