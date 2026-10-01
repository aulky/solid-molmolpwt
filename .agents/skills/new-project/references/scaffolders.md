# Official scaffolding CLIs

Always run the CLI's `--help` first and pass explicit flags. Scaffolders change their prompts and defaults
between releases. `<name>` is the new directory. Run the command from the PARENT directory of the target.

Legend: **V** = command checked against official docs or `--help` output in 2026-09. **S** = long-stable
command, not re-checked this time; confirm with `--help` before use.

## JavaScript / TypeScript

| stack | command | notes | status |
|---|---|---|---|
| SolidJS / SolidStart | `npm create solid@latest` / `bun create solid` | flags (from `npx create-solid@latest --help`): `-s/--solidstart`, `--v2` (SolidStart v2), `-t/--template <name>`, `--ts`, `-v/--vanilla`, `-l/--library` | V |
| Vite (any SPA) | `npm create vite@latest <name> -- --template <t>` / `bun create vite <name> --template <t>` | templates: `vanilla`, `vue`, `react`, `preact`, `lit`, `svelte`, `solid`, `qwik`, each with a `-ts` variant | V |
| Next.js | `npx create-next-app@latest <name> --yes` / `bun create next-app <name>` | `--ts`, `--tailwind`, `--eslint` or `--biome` or `--no-linter`, `--app`, `--src-dir`, `--import-alias "@/*"`, `--use-bun`, `--skip-install`, `--disable-git`; adds AGENTS.md + CLAUDE.md by default (`--no-agents-md` to skip) | V |
| SvelteKit | `npx sv create <name>` | `--template minimal\|demo\|library`, `--types ts\|jsdoc`, `--no-add-ons`, `--install <pm>` | V |
| Nuxt | `npm create nuxt@latest <name>` / `bun create nuxt <name>` | `-t <template>` (after `--` with npm) | V |
| Astro | `npm create astro@latest <name>` | `-- --template <name>`, `--add <integration>`, `--yes`, `--install` | V |
| Angular | `npm install -g @angular/cli`, then `ng new <name>` | run `ng new --help` for `--routing`, `--style`, `--ssr`, `--defaults` | V (commands), S (flags) |
| React Native / Expo | `npx create-expo-app@latest <name>` | `--template default\|blank\|blank-typescript\|tabs\|bare-minimum`, `--yes` | V |
| Tauri (desktop) | `npm create tauri-app@latest` / `bun create tauri-app` / `cargo create-tauri-app` | interactive; give the user the command if prompts block | V |
| Hono (server) | `npm create hono@latest <name>` | prompts for the runtime template | V |
| Bun (plain TS) | `bun init <name> --yes` | `--react`, `--react=tailwind`, `--minimal` | V |
| Remotion (video) | `npx create-video@latest` | interactive template picker; read `npx create-video@latest --help` first | S |
| Playwright (add e2e) | `npm init playwright@latest` | run inside an existing project | S |

## Other ecosystems

| stack | command | notes | status |
|---|---|---|---|
| Rust | `cargo new <name>` / `cargo new <name> --lib` | `--vcs none` to skip git | V |
| Go | `mkdir <name>`, `cd <name>`, `go mod init <module-path>` | the module path is usually the repo URL, e.g. `github.com/org/name` | V |
| Python (uv) | `uv init <name> --app` / `--lib` / `--package` | `--python <version>`, `--vcs none`; add deps with `uv add <pkg>` | V |
| FastAPI | `uv init <name> --app`, then `uv add "fastapi[standard]"` | no official project generator; keep the layout small | S |
| Django | `uv init <name> --app`, `uv add django`, then `uv run django-admin startproject <config> .` | `python -m django startproject` also works | S |
| Laravel | `composer global require laravel/installer`, then `laravel new <name>` | alternative: `composer create-project laravel/laravel <name>` | V (installer), S (create-project) |
| Rails | `rails new <name>` | `--database=postgresql`, `--api`, `--skip-test`, see `rails new --help` | S |
| Phoenix | `mix archive.install hex phx_new`, then `mix phx.new <name>` | `--no-ecto`, `--database postgres` | S |
| Elixir (plain) | `mix new <name>` / `mix new <name> --sup` | | S |
| .NET | `dotnet new list`, then `dotnet new webapi -n <Name>` / `console` / `classlib` / `xunit` | `dotnet new sln` + `dotnet sln add` for multi-project | S |
| Spring Boot | `curl https://start.spring.io/starter.zip -d dependencies=web,actuator -d type=maven-project -d name=<name> -o <name>.zip`, then unzip | or the Spring Initializr web UI; PowerShell: use `curl.exe` (not the `curl` alias) | S |
| Flutter | `flutter create <name>` | `--platforms web,android,ios`, `--org com.example` | S |
| Dart (plain) | `dart create -t console <name>` | `-t package`, `-t server-shelf` | S |
| Swift package | `swift package init --type executable --name <name>` | `--type library` | S |
| C / C++ (CMake) | no official generator: write a minimal `CMakeLists.txt` + `src/main.cpp`, then `cmake -S . -B build` | | S |

## After scaffolding (always)

1. Read the generated manifest (`package.json`, `Cargo.toml`, `pyproject.toml`, `composer.json` and so on) and
   the README. Record the actual versions in the ADR. Do not use versions from memory.
2. Delete demo content only if the user wants a blank start. Keep one route/page/test so the gates have
   something to run.
3. Check for generated agent files (`AGENTS.md`, `CLAUDE.md`, `.cursor/`, `.github/copilot-instructions.md`).
   Merge useful facts into the project's root `AGENTS.md`. Never leave `AGENTS.md`/`GEMINI.md` files below the
   project root, because every such file becomes an always-on directory rule.
4. Install with the package manager the scaffolder chose (look at the lockfile). Never mix package managers.
