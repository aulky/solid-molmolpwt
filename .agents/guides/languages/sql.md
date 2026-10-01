# SQL — engineering guide
> Last verified: 2026-09 — current stable lines confirmed via vendor release notes: PostgreSQL 18 (19 in beta), MySQL 9.7 LTS / 8.4 LTS (Innovation now calendar-versioned, 26.7), MariaDB 12.3 LTS / 13.0 rolling, SQL Server 2025 (GA Nov 2025), SQLite 3.53.x; sqlfluff dialects confirmed: `postgres`, `mysql`, `mariadb`, `sqlite`, `tsql`. Feature-introduction versions below are settled history — verify only the *deployed engine version* against the project's config/container tag.
> Scope: writing, reviewing, testing and tuning SQL across PostgreSQL, MySQL/MariaDB, SQLite and SQL Server. Quick card: `.agents/rules/lang-sql.md` · principles: `.agents/guides/principles/database-design.md`, `.agents/guides/principles/performance.md`, `.agents/guides/principles/security.md`, `.agents/guides/principles/concurrency.md`.

## 1. Mental model / philosophy
- **Declarative, not procedural.** You describe the result set; the planner picks the retrieval algorithm. Don't hint join order or loop row-by-row unless you've measured a specific plan regression.
- **Think in sets.** A loop issuing one query per row is the N+1 anti-pattern (§9) — rewrite as one query with a `JOIN` or `WHERE IN (...)`.
- **Portable core vs. dialect extensions.** `SELECT`/`JOIN`/`WHERE`/`GROUP BY`/`ORDER BY`, subqueries, `UNION`/`INTERSECT`/`EXCEPT`, `WITH` CTEs and window functions work the same everywhere — write in this subset by default. Reach for an extension (Postgres `RETURNING`, MySQL `ON DUPLICATE KEY UPDATE`, SQL Server `TOP`/`OUTPUT`, SQLite `PRAGMA`) only once the project is committed to one engine.
- **The schema enforces invariants, not the app.** `NOT NULL`/`CHECK`/`UNIQUE`/FK apply to every writer — a future script, a migration, a bug — while an app-level check only applies to callers that remember it.
- **Every value is a parameter, never a string fragment** — injection remains a top, high-impact web risk class (OWASP Top 10 2025: A05 Injection). See §3, §7.
- **NULL means "unknown," not empty/zero.** Comparisons follow three-valued logic and silently drop rows instead of erroring. See §3.

## 2. Project structure & tooling
```text
migrations/    # ordered, timestamped/numbered files — never edit one already applied (§9)
db/seeds/      # idempotent seed/fixture data
queries/       # hand-written SQL, if not going through an ORM query builder
.sqlfluff      # dialect, rules, templater
```
**Migration tooling is project-specific** — check the manifest/lockfile first: Prisma/Drizzle/Knex/Kysely (Node), Alembic (Python), goose/golang-migrate/sqlx-cli (Go), Flyway/Liquibase (JVM), `php artisan migrate` (Laravel), Rails `db/migrate`. Follow whichever is present; never run a second mechanism alongside it.

| Task | PostgreSQL | MySQL / MariaDB | SQLite | SQL Server |
|---|---|---|---|---|
| Client | `psql -d db` | `mysql -u user -p db` | `sqlite3 file.db` | `sqlcmd -S srv -d db` |
| Describe table | `\d table` | `DESCRIBE table;` | `.schema table` | `sp_help table` |
| Plan (estimate) | `EXPLAIN q` | `EXPLAIN q` | `EXPLAIN QUERY PLAN q` | SSMS estimated plan |
| Plan (actual run) | `EXPLAIN (ANALYZE, BUFFERS) q` | `EXPLAIN ANALYZE q` (MySQL 8.0.18+); MariaDB: `ANALYZE q` | none (`EXPLAIN QUERY PLAN` is estimate-only) | `SET STATISTICS IO, TIME ON;` or SSMS actual plan |

**Lint/format**: set the dialect once in `.sqlfluff`:
```ini
[sqlfluff]
dialect = postgres   # or: mysql, mariadb, sqlite, tsql
templater = raw       # or jinja/dbt if the project templates SQL
```
`sqlfluff lint <path>` · `sqlfluff format <path>` (safe) · `sqlfluff fix <path>` (full ruleset — review the diff). `sql` isn't a registered `verify.mjs` stack — run `sqlfluff` directly until one is added.

## 3. Core idioms
**Parameterized queries, every driver.** Only the placeholder syntax differs — bind, never concatenate, always.
```sql
SELECT id, email FROM users WHERE email = $1 AND active = $2;  -- Postgres: numbered
SELECT id, email FROM users WHERE email = ?  AND active = ?;   -- MySQL/MariaDB/SQLite: positional
SELECT id, email FROM users WHERE email = @email AND active = @active; -- SQL Server: named
```
A dynamic **identifier** (column/table name from a query string) can't be bound — parameters bind values, not syntax. Validate against an allowlist first:
```python
# BAD:  "SELECT * FROM orders ORDER BY " + sort_col   (unvalidated, from req.query.sort)
# GOOD:
ALLOWED_SORT_COLUMNS = {"created_at", "total_cents", "status"}
if sort_col not in ALLOWED_SORT_COLUMNS:
    raise ValueError(f"invalid sort column: {sort_col!r}")
cur.execute(f"SELECT * FROM orders ORDER BY {sort_col} LIMIT %s", (limit,))
```

**NULL: three-valued logic.** Every comparison with NULL (`=`,`!=`,`<`,`>`) evaluates to UNKNOWN, and `WHERE`/`JOIN ON`/`HAVING` keep only TRUE rows — UNKNOWN is dropped silently, like FALSE, with no error.
```sql
-- BAD: matches nothing for NULL phones, even though "not this number" feels like it should include them
SELECT * FROM contacts WHERE phone != '555-0100';
-- BAD: one NULL email anywhere in blocklist makes NOT IN UNKNOWN for every row -> zero results
SELECT * FROM users WHERE email NOT IN (SELECT email FROM blocklist);

-- GOOD
SELECT * FROM contacts WHERE phone IS DISTINCT FROM '555-0100'; -- Postgres/SQLite; MySQL/MariaDB: NOT (phone <=> '555-0100')
SELECT * FROM users u WHERE NOT EXISTS (SELECT 1 FROM blocklist b WHERE b.email = u.email);
```
Aggregates skip NULLs (`COUNT(col)` vs `COUNT(*)`; `AVG`/`SUM` ignore them rather than treat as 0) — `COALESCE(col, 0)` first if you want zero semantics.

**Joins vs. subqueries.** `JOIN` when you need columns from both tables. `EXISTS`/`NOT EXISTS` for a membership check only — short-circuits and has correct NULL semantics (unlike `IN`/`NOT IN` above). A correlated subquery in `SELECT` runs once per outer row; for "one related value per row across many rows," a `LEFT JOIN` or window function is cheaper.
```sql
SELECT o.id, o.total_cents, c.name FROM orders o
JOIN customers c ON c.id = o.customer_id WHERE o.status = 'paid';

SELECT c.id, c.name FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
```

**CTEs (`WITH`)** name an intermediate result for readability or recursion — not a "materialization fence." In Postgres 12+/MySQL 8+/MariaDB/SQL Server a non-recursive CTE is inlined like a view (Postgres can force `MATERIALIZED`/`NOT MATERIALIZED` when you must override the planner, backed by `EXPLAIN` evidence).
```sql
-- org chart, root to leaves. Postgres/MySQL 8+/MariaDB/SQLite need WITH RECURSIVE;
-- SQL Server infers recursion from the self-reference, no RECURSIVE keyword.
WITH RECURSIVE org AS (
  SELECT id, manager_id, name, 1 AS depth FROM employees WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.manager_id, e.name, org.depth + 1
  FROM employees e JOIN org ON e.manager_id = org.id
)
SELECT * FROM org ORDER BY depth, name;
```

**Window functions** (`OVER (...)`) compute across related rows while keeping one output row per input — `GROUP BY` collapses rows, a window function doesn't. Supported since Postgres, MySQL 8+, MariaDB 10.2+, SQLite 3.25+, SQL Server 2012+.
```sql
SELECT order_id, customer_id, created_at, total_cents,
  ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at) AS order_seq,
  SUM(total_cents) OVER (PARTITION BY customer_id ORDER BY created_at
                          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total
FROM orders;
```
`RANK()`/`DENSE_RANK()` for ties sharing a place; `ROW_NUMBER()` for a unique ordinal — the usual way to pick "top 1 per group" is filtering `order_seq = 1` in a wrapping query.

**Pagination: keyset over `OFFSET`.** `LIMIT n OFFSET m` scans and discards `m` rows every request (page 500 ≫ page 1), and rows can shift between page loads. Keyset carries the last row's sort key as a cursor:
```sql
-- BAD: cost grows with page number
SELECT id, created_at, total_cents FROM orders
ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET 9980;
-- GOOD: constant cost regardless of page
SELECT id, created_at, total_cents FROM orders
WHERE (created_at, id) < ($1, $2)   -- previous page's last row
ORDER BY created_at DESC, id DESC LIMIT 20;
```
**SQL Server has no row-value comparison in a `WHERE` predicate** — `(a, b) < (@p1, @p2)` is a syntax error there (row constructors only appear in `INSERT ... VALUES`/table constructors). Expand the two-column case explicitly:
```sql
-- SQL Server keyset page, expanded (no tuple comparison)
SELECT TOP (20) id, created_at, total_cents FROM orders
WHERE created_at < @p1 OR (created_at = @p1 AND id < @p2)
ORDER BY created_at DESC, id DESC;
```
`OFFSET` is fine for a small bounded UI (page 1–5). Use keyset once the table is large/unbounded or the API is a public feed.

## 4. Error handling
- **Constraint violations are the DB validating for you** — catch the specific error (Postgres SQLSTATE `23505`/`23503`/`23514`; MySQL/MariaDB `1062`/`1452`; SQL Server `2627`/`2601`) and translate it to a domain error (`EmailAlreadyRegistered`), not a leaked driver exception.
- **Upsert beats check-then-write.** A `SELECT` then conditional `INSERT` races under concurrency. Use `INSERT ... ON CONFLICT (...) DO UPDATE` (Postgres/SQLite), `ON DUPLICATE KEY UPDATE` (MySQL/MariaDB), or `MERGE` (SQL Server; Postgres 15+ too).
- **Transactions roll back the whole unit.** `BEGIN ... COMMIT`, `ROLLBACK` on any error. A `SAVEPOINT` rolls back part of a transaction without losing the rest:
```sql
BEGIN;
  INSERT INTO orders (customer_id, total_cents) VALUES ($1, $2) RETURNING id; -- Postgres/SQLite 3.35+/MariaDB; plain MySQL: LAST_INSERT_ID()
  SAVEPOINT before_item;
    INSERT INTO order_items (order_id, sku, qty) VALUES ($3, $4, $5);
  -- on a caught per-item error: ROLLBACK TO SAVEPOINT before_item;
COMMIT;
```
- **Foreign keys need an explicit `ON DELETE`/`ON UPDATE`** (`RESTRICT` default/safest, `CASCADE`, `SET NULL`) — decide per relationship, don't leave it implicit.
- **`NOT NULL`/`CHECK`/`UNIQUE` at the schema**, not "the app always validates first" — a second writer that skips app validation will corrupt data the schema would have refused.

## 5. Testing
- **Test against a real instance of the target engine**, not a mock or a different engine's stand-in (SQLite's dialect differs enough from Postgres/MySQL that passing there proves little): `docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=test postgres:18`, or the project's existing compose/testcontainers setup.
- **Isolate each test**: wrap it in a transaction and roll back at the end (fast; most frameworks support this), or `TRUNCATE`/reseed between tests. Never depend on execution order or leftover rows.
- **Run real migrations before the suite** — a hand-written test schema drifts silently from production migrations.
- **Test the violation, not just the happy path.** For a `UNIQUE`/`CHECK`/FK constraint, assert the violating write raises the expected error — often the only thing exercising it.
```sql
INSERT INTO users (email, name) VALUES ('test@example.com', 'Test User') ON CONFLICT (email) DO NOTHING; -- idempotent seed
```
- **Assert on rows/shapes returned, not generated SQL text** — the latter breaks on any equivalent rewrite.
- Use the engine's own test framework for stored procedures if one is already installed (pgTAP, tSQLt) rather than adding a new one.

## 6. Performance
**Measure first.** `EXPLAIN` is the estimated plan; `EXPLAIN ANALYZE` (Postgres; MySQL 8.0.18+; MariaDB: prefix with `ANALYZE`) runs the query and shows actual rows/time (wrap a real `DELETE`/`UPDATE` in a transaction, roll back, if you only want the plan). Read bottom-up: a full scan where an index scan was expected, or a large estimate/actual gap (stale stats — `ANALYZE table;`/`ANALYZE TABLE table;`/`UPDATE STATISTICS table;`), are the two most common findings.

**Composite index order:** equality-filtered columns first, the one range/`ORDER BY` column last — an index can satisfy a range/sort at one column position only.
```sql
CREATE INDEX idx_orders_status_created ON orders (status, created_at); -- status = ? (equality), sort by created_at
```
**Covering index** (index-only scan): include the `SELECT`ed columns — `CREATE INDEX idx ON orders (customer_id) INCLUDE (created_at, total_cents);` (Postgres/SQL Server `INCLUDE`).
**Partial index** (Postgres/SQLite): `CREATE INDEX idx_pending ON orders (created_at) WHERE status = 'pending';` — smaller, cheaper to maintain than a full index. MySQL/MariaDB have no partial index (approximate with a generated column); SQL Server's *filtered index* is separate syntax with the same intent.

**A function around an indexed column blocks index use**: `WHERE DATE(created_at) = '2026-01-01'` can't use a plain index on `created_at`. Rewrite as a range (`created_at >= ... AND created_at < ...`), or add an expression index (Postgres/SQLite direct; SQL Server via a computed column; MySQL/MariaDB via a functional key part).

**N+1**: fetching a list then one more query per row (often a lazy-loaded ORM association) — batch it into one `JOIN`, window function, or `WHERE id IN (...)`.
**Batch writes**: many single-row `INSERT`s each pay full commit/round-trip cost — use one multi-row `INSERT ... VALUES (...), (...)` or one transaction per batch.

## 7. Security
- **Parameterized queries only (§3)** — including an ORM's raw-SQL escape hatch (`.raw()`, `db.exec(sql)`); those still need bound parameters, not f-strings/template literals. Unsafe even for "internal/already validated" values — validation logic changes, the query outlives it.
- **Least privilege DB users**: the app's connection user gets exactly the privileges its queries need, never `root`/superuser. A migration-runner user needs DDL the app user shouldn't.
- **Avoid `SELECT *`** in app code — leaks columns added later, defeats covering indexes. Name the columns.
- **No secrets in migration files, seeds, or committed SQL.**
- **Row-level security** (Postgres `CREATE POLICY`, SQL Server `CREATE SECURITY POLICY`) is defense-in-depth for multi-tenant data — an addition to app-level filtering, not a replacement.
- **Log queries, not results**, when auditing — full result rows can leak PII into weaker-access log storage.

## 8. Concurrency: transactions, isolation, locking
**ACID**: Atomicity (all-or-nothing), Consistency (constraints hold at commit), Isolation (visibility between concurrent transactions, tunable below), Durability (a commit survives a crash).

**Isolation levels** trade correctness for concurrency:
| Level | Dirty read | Non-repeatable read | Phantom read |
|---|---|---|---|
| Read Uncommitted | possible | possible | possible |
| Read Committed | prevented | possible | possible |
| Repeatable Read | prevented | prevented | possible (InnoDB's gap locks/MVCC prevent phantoms too — a strengthening beyond the standard) |
| Serializable | prevented | prevented | prevented |

Pick per transaction for the anomaly you must prevent — don't blanket-raise it. **Defaults**: Postgres/SQL Server → Read Committed; MySQL/MariaDB (InnoDB) → Repeatable Read; SQLite → one writer at a time (`PRAGMA journal_mode=WAL;` lets readers proceed; retry `SQLITE_BUSY`). Set explicitly with `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;`; a serializable transaction can fail under contention — catch and retry it whole.

**Explicit row locking**, e.g. "decrement stock, don't oversell":
```sql
BEGIN; -- Postgres/MySQL/MariaDB
SELECT quantity FROM inventory WHERE sku = $1 FOR UPDATE; -- locks until COMMIT/ROLLBACK
UPDATE inventory SET quantity = quantity - 1 WHERE sku = $1;
COMMIT;
```
SQL Server: `SELECT quantity FROM inventory WITH (UPDLOCK, ROWLOCK) WHERE sku = @sku;` inside `BEGIN TRAN ... COMMIT`.

**Lock rows in a consistent order** across every transaction touching more than one row (e.g. always the lower `id` first) — opposite orders deadlock; one transaction is killed as victim. **Keep transactions short**: never hold a lock across a network call or user input.

**Optimistic concurrency** (a `version`/`updated_at` column, checked-and-incremented) avoids holding locks, at the cost of detecting and retrying a conflicting update — good for low-contention/high-read workloads; pessimistic (`FOR UPDATE`) suits high-contention hot rows.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| String-concatenated/templated SQL | SQL injection | Bind every value as a parameter (§3, §7) |
| `= NULL` / `NOT IN` on a nullable column | Silently drops/empties results | `IS [NOT] NULL`, `IS [NOT] DISTINCT FROM`, `NOT EXISTS` |
| `OFFSET n` pagination on a large/live table | Scan grows per page; rows shift between requests | Keyset pagination on a stable sort key |
| One query per row in a loop (N+1) | Multiplies round trips | `JOIN`, window function, or batched `WHERE id IN (...)` |
| `SELECT *` | Leaks new columns; blocks covering indexes | Name the columns you use |
| New index guessed without `EXPLAIN` | Wrong composite order is unusable; slows writes | Check existing indexes and the real query first (§6) |
| Uniqueness/relationship only in app code | A race or second writer bypasses it | `UNIQUE`/`CHECK`/FK in schema; upsert for the race |
| Hand-editing an applied migration | Drifts from what's deployed | New migration; expand/contract for breaking changes |
| Long transaction holding locks across I/O | Blocks others, risks deadlocks/timeouts | Keep the transaction to DB work only |
| Function around an indexed column in `WHERE` | Index can't be used; full scan | Sargable range predicate, or expression index |
| Assuming one dialect's syntax works everywhere | `RETURNING`/`MERGE`/upsert/pagination differ | Confirm the target engine; use the portable core (§1) |

## 10. Review checklist
- [ ] Every value bound as a parameter, including via an ORM's raw-SQL escape hatch; any dynamic identifier checked against an allowlist.
- [ ] No `= NULL`/`!= NULL`; no `NOT IN` against a nullable subquery/column.
- [ ] `EXPLAIN`/`EXPLAIN ANALYZE` checked for a new/changed non-trivial query; touched columns indexed, right composite order; no function wrapping an indexed column.
- [ ] Related writes are one transaction, rolled back on error; no lock held across network/I/O.
- [ ] Pagination past page 1 is keyset, not growing `OFFSET`, on any table that can get large.
- [ ] `UNIQUE`/`CHECK`/`NOT NULL`/FK enforce invariants at the schema; FK `ON DELETE`/`ON UPDATE` explicit.
- [ ] Concurrent read-modify-write uses `FOR UPDATE`/`WITH (UPDLOCK, ROWLOCK)` or optimistic versioning, locks in a consistent order.
- [ ] Migration is a new file, never an edit to an applied one; breaking changes use expand/contract.
- [ ] `sqlfluff lint`/`format` clean (`sql` has no `verify.mjs` stack yet — run it directly).
- [ ] Nothing dialect-specific assumed without confirming the actual target engine.

## 11. References
- PostgreSQL: https://www.postgresql.org/docs/current/ · https://www.postgresql.org/docs/current/sql-explain.html · https://www.postgresql.org/docs/current/sql-merge.html
- MySQL: https://dev.mysql.com/doc/refman/en/ · https://dev.mysql.com/doc/refman/en/explain.html · https://dev.mysql.com/doc/refman/en/insert-on-duplicate.html
- MariaDB: https://mariadb.com/kb/en/documentation/ · https://mariadb.com/kb/en/analyze-statement/
- SQLite: https://sqlite.org/lang.html · https://sqlite.org/lang_upsert.html · https://sqlite.org/wal.html
- SQL Server / T-SQL: https://learn.microsoft.com/en-us/sql/t-sql/language-reference · https://learn.microsoft.com/en-us/sql/relational-databases/performance/display-an-actual-execution-plan
- sqlfluff: https://docs.sqlfluff.com/en/stable/ · https://docs.sqlfluff.com/en/stable/reference/dialects.html
- Use The Index, Luke: https://use-the-index-luke.com/ · OWASP SQL Injection: https://owasp.org/www-community/attacks/SQL_Injection
