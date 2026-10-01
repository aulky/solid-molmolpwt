# Database design — engineering guide for AI agents
> Scope: relational schema design — modeling, keys, constraints, indexes, query plans, transactions, migrations — and the ORM, multi-tenancy, soft-delete, time-zone and money pitfalls that surface in production months later. Language-agnostic; examples in SQL, TypeScript, Rust, Python, Go. Quick card: `.agents/rules/01-engineering-standards.md`; topic rules: `.agents/rules/topic-database-design.md`, `.agents/rules/topic-db-migrations.md`.
> Last verified: 2026-09 — UUIDv7 = RFC 9562 (May 2024). PostgreSQL 18 (2025-09-25) added `uuidv7()` and `NOT NULL ... NOT VALID` (release notes). MySQL 9.7 has no UUIDv7 function (`UUID()` is v1; manual); MariaDB 11.7+ has `UUID_v7()`. Python 3.14 `uuid.uuid7()` (ran locally); npm `uuid` v10 (2024-06) added `v7()`; Go 1.27 (Aug 2026) ships a stdlib `uuid` package with `NewV7()`. Drizzle `check()` per orm.drizzle.team. Check the project's engine and runtime versions before relying on any of these.

## 0. How this guide works
Each section = definition → why it causes an incident (often long after shipping) → a **check** to run on your migration or query → bad→good code → the over-application trap. Data outlives code: a wrong column type is fixed with a multi-deploy migration, not an edit.

## 1. Modeling: normalize by default, denormalize on purpose
**Definition:** store each fact once, in the table that owns it, and join when needed. Denormalize only for a measured read problem, and then write down which copy is the source of truth and what keeps the copies in sync.
**Why:** copying `customer_name` onto every `orders` row "to save a join" creates update anomalies the day a customer renames: some rows change, some do not, nothing detects it.
**How to check:**
- For every duplicated column: is there ONE documented sync path (same transaction, trigger, event handler)? Or is it an intentional snapshot (the shipping address at order time) that must NOT follow the source?
- Is a repeated string (`status` in three tables) better as a lookup table, an enum, or a `CHECK (status IN (...))`?
- Does a JSON/JSONB column hold fields you filter, join or constrain on? Those belong in real columns; JSON is for genuinely variable, opaque attributes.
**Trap:** normalizing an append-only event/audit table. An event is a fact as of its time; snapshotting the related values in the row is correct there.

## 2. Primary keys: surrogate vs natural, UUIDv7 vs bigint
**Definition:** a surrogate key has no business meaning (`bigint` identity or UUID); a natural key is an existing unique attribute (email, ISO code). Random UUIDv4 inserts land on random B-tree pages (page splits, cache misses, WAL volume); `bigint` identity is 8 bytes and insert-ordered but needs a central sequence and leaks row counts if exposed; UUIDv7 (48-bit millisecond timestamp prefix) is insert-ordered and globally unique without coordination, at 16 bytes.
**Why:** a natural key that changes (reused email, renamed code) forces rewriting every foreign key; UUIDv4 keys on high-write tables bloat indexes measurably.
**How to check:**
- Is the key stable and never reused for the entity's whole life?
- UUID columns use the native type (`uuid` in Postgres, `BINARY(16)` in MySQL), never `varchar(36)`. MySQL: store v7 with `UUID_TO_BIN(id)` — no swap flag; the swap flag is only for v1 and breaks v7 time order.
- High-write tables use UUIDv7 or `bigint`, not `gen_random_uuid()`/v4.
- The natural key still has its own `UNIQUE` (e.g. `email`): the surrogate replaces the join target, not the invariant.
- Remember UUIDv7 exposes creation time; if that is sensitive in a public id, expose a separate random token.
```sql
-- bad: random v4 keys — every insert touches a random index page
CREATE TABLE orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ...);

-- good (PostgreSQL 18+): time-ordered, no central sequence
CREATE TABLE orders (id uuid PRIMARY KEY DEFAULT uuidv7(), ...);
-- good (older engines): generate v7 in the app, or use a plain identity key
CREATE TABLE orders (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ...);
```
**Trap:** migrating every table to UUIDv7 "because it's newer". Choose it when ids must be generated before insert (client, offline, event sourcing) or merged across shards/services; otherwise `bigint` identity is smaller and simpler.

## 3. Constraints: the database enforces invariants
**Definition:** `NOT NULL`, `UNIQUE`, `FOREIGN KEY`, `CHECK` (and in Postgres `EXCLUDE` for non-overlap) make invalid rows impossible, whatever code writes them.
**Why:** an invariant enforced only in app code is as strong as the least careful writer: a backfill script, a second service, a manual fix, a future feature. App-level uniqueness checks also lose races (two requests both see "not taken").
**How to check:** every column the code treats as always present is `NOT NULL`; every relationship the code assumes has a `FOREIGN KEY` with a deliberate `ON DELETE` (`RESTRICT` by default, `CASCADE` only for owned children); row-level rules (`price >= 0`, `ends_at > starts_at`) are `CHECK`s; "must be unique" is a `UNIQUE` constraint, not a `SELECT` before `INSERT`. Keep the app-side validation too — it gives good error messages; the constraint gives correctness.
```ts
// TypeScript / Drizzle (Postgres) — bad: nullable FK, no FK, negative prices allowed
export const orders = pgTable("orders", {
  id: uuid().primaryKey(),
  customerId: uuid(),
  priceCents: integer().notNull(),
});

// good: the invariants the code already assumes are enforced by the schema
export const orders = pgTable("orders", {
  id: uuid().primaryKey(),
  customerId: uuid().notNull().references(() => customers.id, { onDelete: "restrict" }),
  priceCents: integer().notNull(),
}, (t) => [check("price_non_negative", sql`${t.priceCents} >= 0`)]);
```
**Trap:** a cross-row rule ("allocations must not exceed the budget") as a single-row `CHECK` — it cannot see other rows. Enforce it in the writing transaction with a lock (§6) or a maintained aggregate with its own constraint.

## 4. Indexes: what to index, and what it costs
**Definition:** an index is an extra ordered structure that trades write cost and storage for read speed. Composite indexes serve queries by leftmost prefix; a covering index (`INCLUDE` in Postgres) answers the query without touching the table.
**Why:** a missing index on a hot `WHERE`/`JOIN`/`ORDER BY` becomes a sequential scan that slows every day the table grows; unused or duplicate indexes only tax writes.
**How to check:**
- Foreign-key columns are indexed: PostgreSQL and SQL Server do NOT create these automatically (MySQL InnoDB does).
- Composite order: equality columns first, then range/sort columns (`(tenant_id, status, created_at)` serves `WHERE tenant_id=? AND status=? ORDER BY created_at`).
- A new index on a large, live Postgres table uses `CREATE INDEX CONCURRENTLY` (outside a transaction) so writes are not blocked.
- Each new index names the query it serves; `EXPLAIN` before/after proves it is used (§5).
- Unused candidates (Postgres), excluding PK/UNIQUE-backing indexes: `SELECT s.relname, s.indexrelname, s.idx_scan FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary;`. Counters are per node and since the last stats reset: check replicas and stats age; never drop without a human decision.
**Trap:** one index per column "just in case" on a write-heavy table; most are redundant once a composite index leads with that column.

## 5. Reading query plans
**Definition:** `EXPLAIN` shows the planner's chosen plan; `EXPLAIN ANALYZE` runs the query and adds actual rows and timings (Postgres: `EXPLAIN (ANALYZE, BUFFERS)`; MySQL 8.0.18+: `EXPLAIN ANALYZE`; SQLite: `EXPLAIN QUERY PLAN`). `ANALYZE` executes: wrap writes in `BEGIN; ... ROLLBACK;`.
**Why:** a query that is fast on 500 dev rows with a sequential scan becomes an incident at 50 million rows. Wall-clock time on fixtures proves nothing; the plan does.
**How to check:** for each new or changed query on a growing table, run the plan against realistic volume (a staging copy, or generate rows). Look for: `Seq Scan` / MySQL `type: ALL` where you expected an index; estimated vs actual rows off by 10x or more (stale statistics: run `ANALYZE`, or a predicate the planner cannot estimate); `Sort` spilling to disk; nested loops over large row counts; the same query appearing N times in the query log (N+1, §8).
**Trap:** trying to eliminate every sequential scan. For small tables or low-selectivity predicates (a 50/50 boolean) the scan is the planner's correct choice.

## 6. Transactions and isolation
**Definition:** a transaction commits or rolls back its statements as one unit; the isolation level decides which anomalies concurrent transactions can see (non-repeatable read, phantom, lost update, write skew). Defaults differ: PostgreSQL, SQL Server and Oracle use `READ COMMITTED`; MySQL InnoDB uses `REPEATABLE READ`. Neither default makes check-then-act safe.
**Why:** "read balance, decide, write" interleaves with another transaction doing the same, and both succeed. The bug lives in the gap between read and write, not in any single statement.
**How to check:** for each read-then-write whose correctness depends on the value read (balances, stock, seat booking, "max N per user"), use one of: a single conditional statement (preferred), `SELECT ... FOR UPDATE` on the rows, a version column (optimistic: `UPDATE ... WHERE version = $v`, 0 rows → retry or 409), or `SERIALIZABLE` with a retry loop on serialization failure (Postgres SQLSTATE `40001`). Transactions contain no network calls, no user waits, no sleeps — they hold locks the whole time. Side effects that must follow a commit (emails, events) go through an outbox table written in the same transaction.
```rust
// Rust / sqlx — bad: two concurrent withdrawals both pass the check
let balance: i64 = sqlx::query_scalar("SELECT balance FROM accounts WHERE id = $1")
    .bind(id).fetch_one(&pool).await?;
if balance >= amount {
    sqlx::query("UPDATE accounts SET balance = balance - $1 WHERE id = $2")
        .bind(amount).bind(id).execute(&pool).await?;
}

// good: check and write in one atomic statement
let res = sqlx::query("UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND balance >= $1")
    .bind(amount).bind(id).execute(&pool).await?;
if res.rows_affected() == 0 { return Err(Error::InsufficientFunds); }
```
**Trap:** `SERIALIZABLE` everywhere "to be safe": serialization failures under contention need retries you probably did not write. Use the narrowest tool that closes the race.

## 7. Migrations: expand/contract
**Definition:** a change that running code depends on ships in separately deployable steps: expand (add the new shape alongside the old, nullable/defaulted), migrate (backfill in batches, dual-write, switch reads), contract (drop the old shape once no deployed code reads it).
**Why:** during a rolling deploy old and new code run against the same database. A migration that renames or drops a column the old code still reads is an outage, even though the diff looked correct.
**How to check:**
- A rename or type change is never one `RENAME COLUMN`/`ALTER TYPE` on a live table; it is add → backfill → dual-write → read new → drop old, across deploys.
- A new `NOT NULL` column has a `DEFAULT` (cheap in Postgres 11+ for constant defaults) or ships after its backfill.
- Large-table constraints avoid a long exclusive lock: `ADD CONSTRAINT ... NOT VALID`, then `VALIDATE CONSTRAINT` (FK, `CHECK`; `NOT NULL` too on Postgres 18+).
- Backfills run in batches (`WHERE id > $last ORDER BY id LIMIT 5000`), not one giant `UPDATE`.
- The migration has been run on a copy of production-sized data, and the down path (or the forward fix) is written.
- Set a `lock_timeout` (Postgres) so a blocked `ALTER` fails fast instead of queuing every query behind it.
```sql
-- bad: breaks every running instance that still reads "name"
ALTER TABLE users RENAME COLUMN name TO full_name;

-- good: deploy 1 (expand) — then backfill in batches and make code write both
ALTER TABLE users ADD COLUMN full_name text;
-- deploy 2: code reads full_name. deploy 3 (contract), once nothing reads "name":
ALTER TABLE users DROP COLUMN name;
```
**Trap:** full expand/contract for a table no live code touches yet (created in this unreleased branch) or in a real maintenance window. It protects rolling deploys; name which case you are in.

## 8. ORM pitfalls
**Definition:** an ORM hides WHEN a query runs and HOW MANY run. `order.customer.name` looks like a field access and may be a query.
**Why:** a lazy relation inside a loop turns 1 query into N+1 — invisible with 3 fixture rows, a timeout with 3,000 real ones. Other classics: `SELECT *` pulling large columns; loading whole tables to count or filter in memory; one-row-at-a-time saves in a loop; ORM-generated migrations that silently drop and recreate.
**How to check:** turn on query logging for the test/endpoint and count queries per request. Eager-load what the loop touches (`joinedload`/`selectinload`, Django `select_related`/`prefetch_related`, Laravel `with()`, Prisma/Drizzle `include`/`with`, EF `Include`). Make lazy loading fail loudly in dev where the ORM supports it (Laravel `Model::preventLazyLoading()`, Rails `strict_loading`, SQLAlchemy `lazy="raise"`). Read ORM-generated migration SQL before applying it.
```python
# Python / SQLAlchemy 2.x — bad: one extra query per order (N+1)
orders = session.scalars(select(Order)).all()
for order in orders:
    print(order.customer.name)  # lazy load: a new SELECT each iteration

# good: load the relation in the original query
orders = session.scalars(select(Order).options(joinedload(Order.customer))).all()
for order in orders:
    print(order.customer.name)  # already loaded
```
**Trap:** eager-loading the whole graph "to be safe". Load what this path reads; for to-many relations prefer a batched second query (`selectinload`) over a row-multiplying join.

## 9. Multi-tenancy
**Definition:** shared tables with `tenant_id` on every row (cheapest, weakest isolation); schema-per-tenant (moderate, migrations multiply); database-per-tenant (strongest, most operational cost). Most products start shared and move a tenant out only for a concrete requirement (compliance, noisy neighbor).
**Why:** in shared tables one query missing its tenant filter is a cross-tenant data leak, not a slow query. The usual cause is a new endpoint, report or job copied from a scoped query that dropped the scope.
**How to check:** every tenant-owned table has `tenant_id NOT NULL`, leading its composite indexes and its unique constraints (`UNIQUE (tenant_id, slug)`); scoping lives in ONE place (ORM global scope, repository base, or Postgres Row-Level Security); background jobs and admin tools set the tenant explicitly; a test proves tenant A cannot read tenant B's row by id. With RLS: table owners bypass policies unless `ALTER TABLE ... FORCE ROW LEVEL SECURITY`, and superuser/`BYPASSRLS` roles always bypass — so the app must not connect as the owner.
**Trap:** database-per-tenant on day one for a few small customers: N-times the migrations, pools and backups for isolation nobody asked for.

## 10. Soft deletes: trade-offs
**Definition:** set `deleted_at` instead of deleting. Every read must now exclude deleted rows, and every uniqueness rule must decide whether deleted rows count.
**Why:** a plain `UNIQUE (email)` keeps a "deleted" user's email forever (they cannot re-register); any query that forgets `deleted_at IS NULL` (a report, a raw SQL fix, a second ORM path, a join) resurrects deleted data. Foreign keys do not cascade a soft delete, so children silently point at a "deleted" parent.
**How to check:** unique rules become partial indexes (`CREATE UNIQUE INDEX ON users (email) WHERE deleted_at IS NULL`, Postgres/SQLite; MySQL needs a generated-column workaround); the filter lives in one place (default scope or view); there is a stated reason (in-app undo, legal hold); personal-data erasure requests still result in a real delete or anonymization.
**Trap:** soft deletes on every table by default. If the need is an audit trail, an append-only history table plus a hard delete is simpler and taxes no queries.

## 11. Time zones
**Definition:** store instants in UTC in a zone-aware type (Postgres `timestamptz`, which stores UTC and converts on I/O); convert to local time only at display. Store future local-time intents ("every Monday 09:00 in Europe/Berlin", a meeting next March) as local wall time + IANA zone name, and compute the instant when needed.
**Why:** a naive `timestamp`/`DATETIME` is an ambiguous number; a server or laptop in another zone writes values hours off, discovered when comparing logs. A future local event pre-converted to UTC drifts when DST rules or the zone's law change.
**How to check:** new columns are `timestamptz` (Postgres) or UTC-normalized by convention and named `*_at` (MySQL `DATETIME` is naive; MySQL `TIMESTAMP` converts to UTC but ends in 2038); app code never builds naive datetimes (Python `datetime.now()` without `tz`, JS `new Date(y, m, d)` in server logic); pure dates (birthday, invoice date) use `date`, not a midnight timestamp; the DB session and servers run in UTC.
**Trap:** storing everything in the server's local zone "for readability". Convert once, at the presentation edge.

## 12. Money: never a float
**Definition:** an amount is an integer count of the currency's minor unit (`1050` = 10.50 USD; note JPY has 0 decimals, some currencies 3) or a fixed decimal (`numeric(19,4)`), always paired with an ISO 4217 currency code. Never `float`/`double`/`real`, never a JS `number` holding decimal amounts, never the Postgres `money` type (locale-dependent, no currency).
**Why:** binary floats cannot represent most decimal fractions (`0.1 + 0.2 !== 0.3`), so sums drift and ledgers stop balancing — found by auditors, not by tests with three fixtures.
**How to check:** no money column is `FLOAT/DOUBLE/REAL`; every amount travels with its currency; rounding mode is explicit (banker's vs half-up) and applied once, at a defined step; splits allocate the remainder cent deliberately; conversions record rate and timestamp.
```go
// Go — bad: float64 money, currency implied
type LineItem struct{ PriceUSD float64 }
total := 0.0
for _, it := range items { total += it.PriceUSD }

// good: integer minor units + explicit currency; mismatches are errors
type Money struct { Minor int64; Currency string } // {1050, "USD"}
func Sum(items []Money, cur string) (Money, error) {
    total := Money{0, cur}
    for _, m := range items {
        if m.Currency != cur { return Money{}, ErrCurrencyMismatch }
        total.Minor += m.Minor
    }
    return total, nil
}
```
**Trap:** money math re-implemented at every call site. Route all arithmetic through one money type or maintained library.

## Checklist (copyable)
- [ ] Every duplicated value has one documented sync path, or is an intentional snapshot
- [ ] Key choice (natural / `bigint` / UUIDv7) fits lifetime and write pattern; UUIDs use a native 16-byte type
- [ ] Invariants the code assumes are `NOT NULL` / `UNIQUE` / `FOREIGN KEY` / `CHECK` in the schema
- [ ] FK columns and hot `WHERE`/`JOIN`/`ORDER BY` columns are indexed; each new index names its query
- [ ] `EXPLAIN (ANALYZE)` ran on new/changed queries against realistic volume
- [ ] Read-then-write races use one atomic statement, a row lock, a version check, or serializable + retry
- [ ] Transactions hold no network calls; post-commit side effects go through an outbox
- [ ] Live schema changes follow expand → backfill → contract; big-table constraints use `NOT VALID` + `VALIDATE`; indexes `CONCURRENTLY`
- [ ] No lazy relation is touched in a loop; query count per request was checked in logs
- [ ] Tenant scoping lives in one place, `tenant_id` leads indexes/uniques, and a cross-tenant test exists
- [ ] Soft-delete tables use partial unique indexes and one shared filter — or hard delete was chosen deliberately
- [ ] Instants are `timestamptz`/UTC; future local events are wall time + IANA zone; dates are `date`
- [ ] Money is integer minor units or `numeric` + currency code — never float, never Postgres `money`

## References
- RFC 9562 (UUID incl. v7): https://www.rfc-editor.org/rfc/rfc9562.html
- PostgreSQL 18 release notes: https://www.postgresql.org/docs/release/18.0/ · `EXPLAIN`: https://www.postgresql.org/docs/current/using-explain.html
- PostgreSQL isolation: https://www.postgresql.org/docs/current/transaction-iso.html · `ALTER TABLE` (NOT VALID, locks): https://www.postgresql.org/docs/current/sql-altertable.html
- PostgreSQL Row Security Policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- MySQL InnoDB isolation levels: https://dev.mysql.com/doc/refman/9.7/en/innodb-transaction-isolation-levels.html
- Use The Index, Luke: https://use-the-index-luke.com/
- Drizzle constraints: https://orm.drizzle.team/docs/indexes-constraints · SQLAlchemy relationship loading: https://docs.sqlalchemy.org/en/20/orm/queryguide/relationships.html
- Evolutionary Database Design (expand/contract): https://martinfowler.com/articles/evodb.html
- Related: `.agents/guides/principles/api-design.md`, `security.md`
