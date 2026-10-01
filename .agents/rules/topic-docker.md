---
trigger: glob
globs: "**/Dockerfile,**/Dockerfile.*,**/*.dockerfile,**/docker-compose*.yml,**/docker-compose*.yaml,**/compose.yaml,**/compose.yml,**/.dockerignore"
description: "Docker and Compose card: build/validate commands, image invariants (pinning, non-root, no secrets, caching), Windows pitfalls, bad->good example. Loaded when editing Dockerfiles or compose files."
---
# Docker - topic card
Principles guide: `.agents/guides/principles/security.md` (supply chain, secrets, least privilege). Service layout questions: `.agents/guides/principles/architecture.md`.

## Toolchain (use the project's own scripts first)
- Validate without building: `docker build --check .` (build checks) and `docker compose config` (prints the resolved file or the error). `hadolint Dockerfile` if installed.
- Build and run: `docker build -t <name>:dev .` - `docker compose up --build -d` - logs `docker compose logs <service>` - stop `docker compose down`.
- Use `docker compose` (the v2 plugin). The old `docker-compose` binary may be missing.
- Daemon not running (`failed to connect to the docker API`) -> report it as a SKIP with the reason. Never claim the image builds.

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER bake secrets into an image (`COPY .env`, `ARG`/`ENV` with tokens) - layers and build history keep them forever. Instead use BuildKit secrets (`RUN --mount=type=secret,id=<id>` with `docker build --secret id=<id>,src=<file>`) at build time and runtime env or secret stores at run time.
2. Pin base images to a specific version tag (`node:<major>-slim`, `python:<x.y>-slim`), never `latest` - `latest` changes under you. Use a digest (`@sha256:...`) where the project already does. Match the version to the project's engines or lockfile.
3. Run as a non-root user (`USER node`, or create one) - a container escape starts with the process's privileges.
4. Use multi-stage builds: build tools and dev dependencies in a builder stage, only runtime artifacts in the final stage - smaller image, smaller attack surface.
5. Order layers for the cache: copy the manifest and lockfile, install with the frozen lockfile (`npm ci`, `bun install --frozen-lockfile`, `pnpm install --frozen-lockfile`, `pip install -r`, `cargo fetch`), then copy the source. `COPY . .` before install reinstalls on every change.
6. Keep `.dockerignore` current: exclude `.git`, `node_modules`, build output, `.env*`, `.agents/.state` - otherwise secrets and huge contexts get sent to the builder.
7. Use exec form for `CMD`/`ENTRYPOINT` (`["node", "server.js"]`) - shell form wraps the process in `sh -c`, so it misses SIGTERM and cannot shut down cleanly.

## Pitfalls Flash models get wrong
- Windows CRLF in an entrypoint `.sh` fails inside Linux with `/bin/sh^M` or `no such file or directory`. Keep scripts LF (`.gitattributes`: `*.sh text eol=lf`).
- `localhost` inside a container is the container itself. Reach other services by compose service name; reach the host with `host.docker.internal` (Docker Desktop).
- `depends_on` only orders startup. To wait for readiness use a `healthcheck` plus `depends_on: {db: {condition: service_healthy}}`.
- `EXPOSE` documents a port; it does not publish it. Publish with `ports: ["8080:8080"]`.
- The top-level `version:` key in compose files is obsolete and only produces a warning. Do not add it.
- `apt-get update` and `apt-get install` belong in the same `RUN`, with `--no-install-recommends` and `rm -rf /var/lib/apt/lists/*`.
- Alpine uses musl; native modules (sharp, bcrypt, prisma engines) can fail. Prefer `-slim` (Debian) unless the project already uses Alpine.
- A bind mount over `/app` hides `node_modules` built in the image. Add an anonymous volume for it, or do not mount over it.
- `docker compose down -v` also deletes named volumes (database data). `-v` or `docker volume rm` only with the user's OK in your brief (else report `BLOCKED:`).

## Example - bad -> good
```dockerfile
# BAD: floating tag, cache-busting copy, root user, shell-form CMD
FROM node:latest
COPY . .
RUN npm install
CMD npm start
```
```dockerfile
# GOOD: pinned, multi-stage, frozen lockfile, non-root, exec form
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:24-slim
WORKDIR /app
COPY --from=build --chown=node:node /app/.output ./.output
USER node
CMD ["node", ".output/server/index.mjs"]
```

## Before finishing
- [ ] `docker build --check .` and `docker compose config` pass (or SKIP with reason)
- [ ] No secrets in layers, `.dockerignore` excludes `.env*` and `.git`
- [ ] Base image pinned, non-root `USER`, exec-form `CMD`
- [ ] If the daemon runs: image builds and the service starts; say what you observed
