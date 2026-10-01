---
trigger: model_decision
description: "Apply when designing or changing database tables, columns, keys, indexes, constraints, transactions, ORM models or relations, or when a query is slow (any SQL or NoSQL store, any ORM)."
---
# Database design - topic rule
Principles guide: `.agents/guides/principles/database-design.md` - read it before designing a new schema or choosing a store. Changing a deployed schema: `/db-migration` (expand/contract). Migration and SQL files also load `topic-db-migrations.md`. Slow-query work: `topic-performance.md`.

## Protocol
1. Read the current schema first (migrations folder, `schema.prisma`, ORM models, or `\d <table>` in psql) and every query that touches the table: `node .agents/scripts/search.mjs '<table_or_model>' src`.
2. List the access patterns before choosing columns and indexes: the top queries with their filter, sort, join and frequency.
3. Put integrity in the database: a primary key on every table, NOT NULL by default, foreign keys, UNIQUE for natural keys, CHECK for enums and ranges. App-level checks alone lose races and miss other writers.
4. Index for those queries: composite column order = equality columns first, then range/sort columns. Index foreign-key columns (PostgreSQL does not create them automatically). Every index slows writes - justify each one.
5. Check the plan of every new or changed query on realistic data: PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)`, MySQL `EXPLAIN ANALYZE`, SQLite `EXPLAIN QUERY PLAN`. Look for sequential scans on big tables, row estimates far from actuals, and sorts spilling to disk.
6. Transactions: wrap each multi-statement invariant in one transaction and keep it short. Know the default isolation (PostgreSQL READ COMMITTED, MySQL InnoDB REPEATABLE READ). For read-modify-write use an atomic `UPDATE ... SET n = n - 1 WHERE id = $1 AND n > 0`, `SELECT ... FOR UPDATE`, or an optimistic `version` column.
7. Test against the real engine (local or container), not a mock or a different engine - SQLite and PostgreSQL differ in types, locking and constraint behaviour.

## Type defaults
- Money: `NUMERIC(p,s)` or integer minor units (`total_cents bigint`) - never float.
- Time: `timestamptz` / UTC; convert to local time only for display.
- Ids: bigint identity, or time-ordered UUIDs (v7) where the stack supports them; random UUIDv4 primary keys fragment B-tree indexes.
- Enums: CHECK constraint or lookup table (altering native enum types is awkward in several engines).
- Soft delete only when required; then use partial unique indexes (`... WHERE deleted_at IS NULL`).

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER run destructive statements (DROP, TRUNCATE, column drop, DELETE/UPDATE without WHERE) against a shared, staging or production DB - irreversible. Instead: a reviewed migration, backup first, expand/contract.
2. NEVER store money in float/double - rounding errors. Instead: decimal or integer minor units.
3. NEVER enforce uniqueness only in app code - two concurrent requests both pass the check. Instead: a UNIQUE constraint and handle the conflict error.
4. NEVER hold a transaction open across user think-time or external HTTP calls - locks pile up and connections run out. Instead: do the I/O first, then a short transaction.
5. NEVER interpolate values into raw SQL, including ORM `raw`/`unsafe` helpers. Instead: bound parameters.

## Pitfalls Flash models get wrong
- ORM N+1: loading relations in a loop. Eager-load (`include`, `select_related`/`prefetch_related`, `with()`, `JOIN FETCH`) and check the SQL log for one query per row.
- `SELECT *` on wide rows; select only the needed columns.
- `OFFSET 100000` paging - use keyset: `WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT 50`.
- Adding an index "for performance" without a query that uses it; functions on indexed columns (`WHERE lower(email) = ...`) without an expression index.
- Assuming `LIKE '%term%'` uses a B-tree index (it does not; use full-text search or trigram indexes).

## Example - bad -> good
```sql
-- BAD: no keys or constraints, float money, unindexed FK, offset paging
CREATE TABLE orders (id int, user_id int, total float, status text, created_at timestamp);
SELECT * FROM orders WHERE user_id = 42 ORDER BY created_at DESC OFFSET 100000 LIMIT 50;

-- GOOD (PostgreSQL)
CREATE TABLE orders (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users (id),
  total_cents bigint NOT NULL CHECK (total_cents >= 0),
  status      text   NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC, id DESC);
SELECT id, total_cents, status, created_at FROM orders
WHERE user_id = $1 AND (created_at, id) < ($2, $3)
ORDER BY created_at DESC, id DESC LIMIT 50;
```

## Before finishing
- [ ] Access patterns listed; every index maps to a query
- [ ] Constraints (PK, FK, NOT NULL, UNIQUE, CHECK) in the schema, not only in code
- [ ] Plans checked for new queries; tests ran against the real engine (or SKIP with reason)
