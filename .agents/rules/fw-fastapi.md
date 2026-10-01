---
trigger: model_decision
globs: "**/main.py,**/app.py,**/dependencies.py,**/deps.py,**/routers.py,**/schemas.py,**/api.py"
description: "Apply when working in a FastAPI/Flask codebase (Python dependency fastapi or flask): deps, Pydantic v2, async, auth, DB sessions, testing."
---
# FastAPI / Flask — quick card
Applies only if Python dependency fastapi or flask. Otherwise ignore this rule.
Deep guide: `.agents/guides/frameworks/fastapi.md` — read before non-trivial work (auth, DB sessions, lifespan, error handlers).

## Project shape
- FastAPI: `main.py`/`app.py` builds `FastAPI(lifespan=...)`; `routers.py`/`api.py` hold `APIRouter()`s included via `app.include_router(r, prefix=..., tags=[...])`; `schemas.py` = Pydantic v2 request/response models; `dependencies.py`/`deps.py` = shared `Depends()` callables (DB session, current user); a settings module wraps `pydantic_settings.BaseSettings`.
- Flask: prefer a `create_app()` factory (testable, config-per-environment) over a global `app`; feature code lives in `Blueprint`s registered inside it; request-scoped state via `flask.g`, app-scoped via `current_app`.

## Invariants (MUST / NEVER — with reason → alternative)
1. MUST use Pydantic v2 APIs (`model_validate`, `model_dump`, `field_validator`, `ConfigDict`) — NEVER v1 (`parse_obj`, `.dict()`, `@validator`, `class Config`) once `pydantic>=2` is installed (check the lockfile) — v1 syntax raises or no-ops on v2.
2. NEVER run blocking calls (`requests`, sync DB drivers, `time.sleep`) inside `async def` — blocks the one event loop for every concurrent request. Use a `def` route/dependency (FastAPI threadpools it) or `await asyncio.to_thread(fn)`.
3. MUST declare dependencies as `Annotated[T, Depends(fn)]` (current style, reusable as a type alias) — a bare `= Depends(fn)` default still works but duplicates across signatures.
4. MUST start/stop shared resources (DB pool, ML model, cache) via the `lifespan` async context manager (`@asynccontextmanager` + `FastAPI(lifespan=...)`) — NEVER `@app.on_event(...)` (deprecated, no ordering guarantee with yield-dependencies).
5. NEVER pass a yield-dependency's resource (e.g. a DB session) into a `BackgroundTasks` callable — its teardown runs *before* background tasks execute (since 0.106), so it may already be closed. Pass an ID; open a fresh resource inside the task.
6. MUST set `response_model=` (or a typed return) on data routes — filters/validates the output, drives the OpenAPI schema; a raw ORM row/dict skips both.
7. NEVER build SQL by string-formatting user input — parameterize (`text("... WHERE id = :id")` bound params, or the ORM builder), FastAPI and Flask alike.
8. MUST read config through a `pydantic_settings.BaseSettings` subclass (env vars, `.env`, validated types) — never scatter bare `os.environ[...]` reads or hardcode secrets/URLs.
9. Flask: NEVER rely on a module-level global `app` once the project has more than one entry point (tests, CLI, WSGI) — use `create_app()` so tests build an isolated instance with test config.

## Patterns
- Chain dependencies instead of duplicating logic: `get_current_user` depends on `oauth2_scheme`; a route depends on `get_current_user` — FastAPI resolves and caches each dependency once per request.
- Domain errors → HTTP: register `@app.exception_handler(YourError)` for one consistent JSON body, instead of catching it in every route.
- Auth: `OAuth2PasswordBearer` + `jwt.encode`/`jwt.decode` (PyJWT); hash passwords with `pwdlib.PasswordHash.recommended()` (argon2) — `passlib` is unmaintained, don't add it to a new project.
- DB: one `async_sessionmaker(engine, expire_on_commit=False)` built at startup (inside `lifespan`); a `get_db` dependency `yield`s a session per request, closed in `finally`.

## Pitfalls
- Flask async views need the `flask[async]` extra; even then Flask stays WSGI — one worker per request, so async only helps concurrent I/O inside a request, not overall throughput.
- `def` vs `async def` isn't "sync is slower" — a correct `def` route (threadpooled) beats an `async def` route that accidentally blocks the loop.
- `response_model` silently drops fields not on the model — a missing response field is usually a schema bug, not a route bug.
- The sync `TestClient` runs `async def` routes fine; reach for `httpx.AsyncClient(transport=ASGITransport(app=app))` only when the test itself awaits other async code — it does **not** trigger `lifespan` (wrap with `asgi-lifespan`'s `LifespanManager` if needed).

## Example — bad → good
```python
# bad: blocks the event loop; returns whatever the ORM gives back; v1 pydantic
@app.get("/users/{id}")
async def get_user(id: int):
    return db.query(User).filter(User.id == id).first()  # sync driver call in async def
```
```python
# good: dependency-injected async session; typed, validated response
@app.get("/users/{id}", response_model=UserOut)
async def get_user(id: int, session: Annotated[AsyncSession, Depends(get_db)]):
    user = await session.get(User, id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

## Before finishing
- [ ] no blocking calls inside `async def` · [ ] every data route has a `response_model`/return type · [ ] settings via `pydantic-settings`, no scattered `os.environ` · [ ] SQL is parameterized, never string-built · [ ] `lifespan` (not `on_event`) owns shared resources · [ ] tests cover the new route/dependency and pass
