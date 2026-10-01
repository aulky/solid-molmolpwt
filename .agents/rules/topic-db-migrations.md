---
trigger: glob
globs: "**/*.sql,**/schema.prisma,**/drizzle.config.*,**/alembic.ini,**/*.migration.ts,**/*_table.php"
description: "Database schema and migration card: migration-tool commands, expand/contract, lock safety, co-changes, bad->good example. Loaded when editing SQL, Prisma, Drizzle, Alembic or migration files."
---
# Database migrations - topic card
Applies to schema and migration files. For a plain query or report `.sql` file only invariants 1 and 7 apply. Principles guide: `.agents/guides/principles/database-design.md` - read it before designing tables, indexes or a multi-step migration. Procedure: `/db-migration`.

## Toolchain (use the project's existing migration tool; NEVER add a second one)
- Prisma: edit `schema.prisma` -> `npx prisma migrate dev --name <change>` (local DB only) -> `npx prisma generate`. Deploy path: `npx prisma migrate deploy`.
- Drizzle: `npx drizzle-kit generate` -> read the SQL -> `npx drizzle-kit migrate`. `drizzle-kit push` and `prisma db push` skip migration files: use them only if the project already works that way.
- Alembic: `alembic revision --autogenerate -m "<change>"` -> read it -> `alembic upgrade head`; test `alembic downgrade -1`.
- Django `python manage.py makemigrations` / `sqlmigrate <app> <n>` / `migrate` - Rails `bin/rails g migration <Name>` / `bin/rails db:migrate` - Laravel `php artisan make:migration <name>` / `php artisan migrate` / `php artisan migrate:rollback` - EF Core `dotnet ef migrations add <Name>` / `dotnet ef database update` - others (goose, golang-migrate, sqlx, diesel, Flyway, Liquibase): follow the project's config.
- Bun projects: `bunx` instead of `npx`.

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER run migrations, resets or destructive SQL against a shared, staging or production database - data loss is irreversible. Use a local or disposable DB; anything else only with the user's OK in your brief (else report `BLOCKED:`). Destructive = `DROP`, `TRUNCATE`, `DELETE`/`UPDATE` without `WHERE`, `migrate reset`, `migrate:fresh`, `db push --force-reset`.
2. NEVER edit a migration that may already be applied (committed, merged or deployed) - tools track applied migrations, so the edit causes drift or never runs. Instead add a new migration. A migration you created in this task and never shared may be edited.
3. Breaking changes use expand -> migrate -> contract: add the new column or table, backfill and dual-write, switch reads, then drop the old one in a later release - old app instances keep running during a deploy. A rename is add + copy + drop.
4. Every migration has a working down/rollback, or a comment saying why it is irreversible and how to restore.
5. Keep schema changes and data backfills in separate steps. Backfill big tables in batches, not in one long transaction that holds locks.
6. Lock safety on large tables (Postgres): plain `CREATE INDEX` blocks writes -> use `CREATE INDEX CONCURRENTLY`, which cannot run inside a transaction block (turn off the tool's per-migration transaction) and leaves an INVALID index on failure (drop it and retry). Add constraints as `NOT VALID`, then `VALIDATE CONSTRAINT`. Other engines: check their online-DDL rules first.
7. Change a schema together with its companions: ORM model, migration, generated client/types, seeds, factories, fixtures, tests, API schemas. To see what usually changes with a file: `git log --follow --name-only --format="%h %s" -- <file>`. Repeated co-change suggests coupling; it does not prove a dependency.

## Pitfalls Flash models get wrong
- `prisma migrate dev` that detects drift offers to RESET the database, which deletes its data. Stop and report `BLOCKED:`; never accept on a DB with real data.
- Autogenerate (Alembic, Django, Drizzle) can read a rename as drop + add and can miss server defaults, enum changes and constraint names. Read the generated SQL before applying it.
- Two branches adding migrations from the same parent split the history (Alembic: `alembic heads` shows more than one; Django: `makemigrations --merge`). Check before adding yours.
- Adding a NOT NULL column without a default to a populated table fails. Add it nullable -> backfill -> set NOT NULL.
- Postgres does not index foreign-key columns automatically. Add the index when you add the FK.
- SQLite has limited `ALTER TABLE`; tools rebuild the table. Read what they generate.
- Seeds, fixtures and raw SQL strings break silently after a rename. Search for the old name and run the tests.

## Example - bad -> good
```sql
-- BAD: one step; running app instances still read "name" and fail
ALTER TABLE users RENAME COLUMN name TO full_name;
```
```sql
-- GOOD, migration 1 (expand): app writes both columns meanwhile
ALTER TABLE users ADD COLUMN full_name text;
UPDATE users SET full_name = name WHERE full_name IS NULL; -- batch on big tables
-- GOOD, migration 2 (contract, later release, after reads switched)
ALTER TABLE users DROP COLUMN name;
```

## Before finishing
- [ ] Used the project's migration tool and read the generated SQL
- [ ] No applied migration edited; the new one has a down or an irreversibility note
- [ ] Ran up -> down -> up on a local or disposable DB, or said why that was impossible
- [ ] Model, generated client, seeds and tests updated; `node .agents/scripts/verify.mjs` passes
