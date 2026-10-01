# Migration commands per tool

**V** = checked against the tool's official docs in 2026-09. **S** = long-stable, not re-checked; confirm with
`--help`. Use the project's package runner (`npx`, `bunx`, `pnpm dlx`, `uv run`, `bundle exec`, `bin/rails`)
and the project's own scripts when they wrap these commands.

Credentials: pass them through the env var the tool reads (usually `DATABASE_URL`). Set it in PowerShell with
`$env:DATABASE_URL = "..."` and in POSIX shells with `export DATABASE_URL=...`. Never echo it.

## Prisma (V, Prisma 6 and 7 docs)
| goal | command |
|---|---|
| create + apply (dev DB) | `npx prisma migrate dev --name <name>` |
| create only, edit the SQL, then apply | `npx prisma migrate dev --name <name> --create-only`, edit `prisma/migrations/<ts>_<name>/migration.sql`, run `npx prisma migrate dev` |
| apply in deploy/CI | `npx prisma migrate deploy` |
| status | `npx prisma migrate status` |
| down script (make it BEFORE creating the up migration, after editing the schema) | `npx prisma migrate diff --from-schema prisma/schema.prisma --to-migrations prisma/migrations --script > down.sql` |
| after a failed deploy | run the down SQL: `npx prisma db execute --file down.sql`, then `npx prisma migrate resolve --rolled-back "<migration_name>"` |
Notes: Prisma has no built-in `down`. Prisma 7 moved the datasource URL into `prisma.config.ts` and removed
`--url` from `db execute`. Select another environment with `--config <file>`. `prisma migrate reset` and
accepting a "reset?" prompt from `migrate dev` (on drift) DROP the database, so use them on local databases only.

## Drizzle Kit (V)
| goal | command |
|---|---|
| generate SQL from the schema | `npx drizzle-kit generate --name=<name>` |
| empty custom SQL migration (data moves, unsupported DDL) | `npx drizzle-kit generate --custom --name=<name>` |
| apply | `npx drizzle-kit migrate` |
| consistency check | `npx drizzle-kit check` |
| sync the schema without migration files | `npx drizzle-kit push`, local development databases ONLY |
Notes: there is no down/rollback command. Revert with a new (custom) forward migration. Applied migrations are
tracked by folder name in the database's drizzle migrations table.

## Laravel (V, 13.x docs)
| goal | command |
|---|---|
| create | `php artisan make:migration add_status_to_orders_table` |
| apply | `php artisan migrate` (production: `php artisan migrate --force`, which the USER runs) |
| preview the SQL | `php artisan migrate --pretend` |
| status | `php artisan migrate:status` |
| roll back | `php artisan migrate:rollback --step=1` (or `--batch=<n>`) |
| run each migration as its own batch | `php artisan migrate --step` |
Notes: write `down()` for every `up()`. For Postgres `CREATE INDEX CONCURRENTLY`, set
`public $withinTransaction = false;` and use `DB::statement(...)`. `migrate:fresh` and `migrate:reset` drop
everything, so use them on local databases only.

## Django (V, 6.0 docs)
| goal | command |
|---|---|
| create | `python manage.py makemigrations <app>` (with uv: `uv run python manage.py ...`) |
| CI check that no migration is missing | `python manage.py makemigrations --check --dry-run` |
| apply | `python manage.py migrate` |
| show the SQL | `python manage.py sqlmigrate <app> <number>` |
| status | `python manage.py showmigrations <app>` |
| roll back to a migration | `python manage.py migrate <app> <previous_number>` (`zero` = unapply all) |
Notes: in data migrations, use `RunPython(forwards, reverse)` with `apps.get_model(...)`, never direct model
imports. A migration with `CREATE INDEX CONCURRENTLY` (`AddIndexConcurrently` from
`django.contrib.postgres.operations`) needs `atomic = False` on the Migration class.

## Rails / Active Record (V for commands; S for the concurrency API)
| goal | command |
|---|---|
| create | `bin/rails generate migration AddPartNumberToProducts part_number:string` |
| apply | `bin/rails db:migrate` (also updates `db/schema.rb`, which you commit) |
| status | `bin/rails db:migrate:status` |
| roll back | `bin/rails db:rollback STEP=1` |
Notes: prefer a reversible `change` method, and use `up`/`down` when Rails cannot infer the reverse. For
concurrent indexes, use `disable_ddl_transaction!` plus `add_index :t, :c, algorithm: :concurrently`. The
strong_migrations gem, if present, enforces most of `lock-safety.md`.

## Alembic (V)
| goal | command |
|---|---|
| create from models | `alembic revision --autogenerate -m "add status to orders"`, then ALWAYS review the file |
| empty revision | `alembic revision -m "<msg>"` |
| apply | `alembic upgrade head` |
| roll back one | `alembic downgrade -1` |
| status | `alembic current` and `alembic history` |
| emit SQL without a database (offline) | `alembic upgrade head --sql` (S) |
Notes: the docs say autogenerate "is not intended to be perfect", so review renames, server defaults and types.
For statements that must run outside a transaction, use `with op.get_context().autocommit_block(): ...`. The
transaction before the block is committed. `alembic upgrade head` fails when there are multiple heads, so merge
them with `alembic merge`.

## EF Core (V)
| goal | command |
|---|---|
| install the tool | `dotnet tool install --global dotnet-ef` and `dotnet add package Microsoft.EntityFrameworkCore.Design` |
| create | `dotnet ef migrations add <Name>` |
| apply | `dotnet ef database update` |
| roll back to a migration | `dotnet ef database update <PreviousMigrationName>` (`0` = all) |
| remove the last UNAPPLIED migration | `dotnet ef migrations remove` |
| list | `dotnet ef migrations list` |
| SQL for deploys | `dotnet ef migrations script --idempotent --output migrate.sql` (not supported by every provider, e.g. SQLite) |
| self-contained deploy exe | `dotnet ef migrations bundle` |
Notes: multi-project solutions need `--project <Migrations.csproj> --startup-project <Web.csproj>`. Review the
generated `Up`/`Down` methods, because renames can come out as drop + add.

## sqlx (Rust) (V)
| goal | command |
|---|---|
| install the CLI | `cargo install sqlx-cli` (optionally `--no-default-features --features <db>,rustls`) |
| create a reversible migration | `sqlx migrate add -r <name>` (creates `.up.sql` + `.down.sql`) |
| apply | `sqlx migrate run` (reads `DATABASE_URL`; `--source <dir>` for a custom folder) |
| revert the last | `sqlx migrate revert` |
| status | `sqlx migrate info` |
| offline query metadata for CI | `cargo sqlx prepare` (commit `.sqlx/`) |
Notes: `-- no-transaction` as the FIRST line runs a migration outside a transaction. Keep ONE statement in such
a file, because a multi-statement batch starts an implicit transaction. After the first `-r` migration, later
ones are reversible too. `sqlx::migrate!()` embeds the migrations at compile time.

## goose (Go) (V)
| goal | command |
|---|---|
| create | `goose -dir migrations create add_status sql` (`-s` = sequential numbers) |
| apply | `goose -dir migrations postgres "<dsn>" up`, or with env vars `GOOSE_DRIVER=postgres` and `GOOSE_DBSTRING=<dsn>`: `goose -dir migrations up` |
| roll back one | `goose -dir migrations down` (with the same driver/DSN) |
| status | `goose -dir migrations status` |
File format: `-- +goose Up` / `-- +goose Down` sections. `-- +goose NO TRANSACTION` for
`CREATE INDEX CONCURRENTLY` (applies to both directions). `-- +goose StatementBegin` / `-- +goose StatementEnd`
around functions (S).

## Atlas (V)
| goal | command |
|---|---|
| generate from the desired schema | `atlas migrate diff <name> --dir "file://migrations" --to "file://schema.sql" --dev-url "docker://postgres/16/dev"` |
| lint (destructive/locking changes) | `atlas migrate lint --dir "file://migrations" --dev-url "docker://postgres/16/dev"` |
| preview | `atlas migrate apply --dir "file://migrations" --url "<url>" --dry-run` |
| apply | `atlas migrate apply --dir "file://migrations" --url "<url>"` |
| revert | `atlas migrate down --dir "file://migrations" --url "<url>" --dev-url "docker://postgres/16/dev"` |
| status | `atlas migrate status --dir "file://migrations" --url "<url>"` (S) |
Notes: the `docker://` dev database needs Docker running. Match the image to the production major version.
`--to` also accepts HCL (`file://schema.hcl`) or a live database URL.

## Others
| tool | create | apply | roll back | status | status tag |
|---|---|---|---|---|---|
| Ecto (Phoenix) | `mix ecto.gen.migration add_status` | `mix ecto.migrate` | `mix ecto.rollback --step 1` | `mix ecto.migrations` | V |
| TypeORM | `npx typeorm migration:generate -d <data-source> <path/Name>` | `npx typeorm migration:run -d <data-source>` | `npx typeorm migration:revert -d <data-source>` | `npx typeorm migration:show -d <data-source>` | V |
| Knex | `npx knex migrate:make add_status` | `npx knex migrate:latest` | `npx knex migrate:rollback` | `npx knex migrate:status` | S |
| Flyway | new `V<n>__<desc>.sql` file | `flyway migrate` | forward-fix migration (`undo` depends on the edition) | `flyway info` / `flyway validate` | S |
