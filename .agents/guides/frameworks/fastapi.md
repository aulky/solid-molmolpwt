# FastAPI / Flask — engineering guide
> Scope: FastAPI (Pydantic v2, dependencies, async, SQLAlchemy 2.0, auth, testing), plus a shorter Flask section
> (app factory, blueprints) — both matched by the `fastapi`/`flask` Python detect. Quick card:
> `.agents/rules/fw-fastapi.md`. This guide is for
> when the kit is copied into a Python API repo (`/onboard-repo`).
> Last verified: 2026-09-30 — official docs (fastapi.tiangolo.com, docs.sqlalchemy.org, flask.palletsprojects.com)
> and PyPI JSON API via WebFetch. Verified current: **FastAPI 0.142.1** (2026-09-29, still pre-1.0) and
> **Flask 3.1.3** (2026-02-19). Re-check the installed version (`site-packages/fastapi/__init__.py` or the
> lockfile) before trusting an exact version claim below — pre-1.0 FastAPI ships minor bumps often.

## 1. Mental model / philosophy
- **Type hints are the API**: FastAPI derives validation, serialization, dependency injection and the OpenAPI schema
  from plain Python type annotations (mostly Pydantic v2 models) — no separate schema DSL to keep in sync.
- **Dependency injection over inheritance**: shared behavior (a DB session, current user, pagination) is a plain
  callable passed to `Depends(...)`, composable by depending on other dependencies — not a base-controller class.
- **Async is opt-in**: a route can be `def` or `async def`; FastAPI threadpools `def` so blocking code doesn't stall
  the loop. Use `async def` only when the body awaits async-native I/O, not by default "for speed".
- **Explicit at the boundary**: validate input with Pydantic models, declare `response_model` on output, raise
  `HTTPException`/register exception handlers — never let unvalidated or unshaped data cross the boundary.
- Flask stays a smaller, extension-based surface by design; reach for FastAPI when you want built-in validation/
  OpenAPI/async, Flask for an intentionally minimal app or a team standardized on Flask-SQLAlchemy/-Login.

## 2. Project structure & tooling
### Release status (verified 2026-09 — re-check the lockfile before trusting exact numbers)
- **FastAPI 0.142.1** (2026-09-29), still pre-1.0 — minor bumps can carry breaking changes (see `/release-notes`);
  diff the lockfile's pinned version against latest before upgrading. Landmarks: **0.100.0** migrated to Pydantic v2;
  **0.106.0** changed yield-dependency teardown ordering vs. `BackgroundTasks` (detailed under Dependencies below).
  Docs recommend **PyJWT** for tokens, **pwdlib** (`PasswordHash.recommended()`, argon2) for hashing — `passlib` is
  unmaintained, don't add it to a new project.
- **Flask 3.1.3** (2026-02-18, latest patch — a session-cookie security fix only, GHSA-68rp-wp8r-4726). The 3.x
  series needs Python 3.9+ (3.7 dropped in 2.3.0/2023-04-25; 3.8 dropped in 3.1.0/2024-11-13); `async` views need
  `flask[async]` but Flask stays WSGI — async only helps I/O *within* one request, not concurrency across requests.
- Runs on **Starlette** (ASGI: routing, `BackgroundTasks`, `TestClient`) and **Pydantic v2** (Rust-core validation).
  ASGI server: `uvicorn`/`hypercorn`; Flask needs a WSGI server (`gunicorn`, `waitress`).

### Commands (swap for the project's package manager — `uv`/`pip`/`poetry` — from its lockfile)
| Task | Command |
|---|---|
| Install | `uv sync` (or `python -m pip install -e ".[dev]"`) |
| Dev server (FastAPI) | `fastapi dev main.py` (or `uvicorn main:app --reload`) |
| Dev server (Flask) | `flask --app app run --debug` |
| Lint/format | `ruff check .` · `ruff format .` |
| Types | `mypy .` (or `pyright`) |
| Test | `pytest -q` |
| Everything (this kit) | `node .agents/scripts/verify.mjs --only python` |

### Project shape (FastAPI)
```
app/
  main.py           # FastAPI(lifespan=...); app.include_router(...) per feature
  dependencies.py    # shared Depends() callables: get_db, get_current_user, pagination
  routers/          # users.py: APIRouter(prefix="/users", tags=["users"]); items.py; ...
  schemas/          # Pydantic v2 request/response models (a.k.a. "schemas.py")
  models/           # SQLAlchemy 2.0 declarative models (DB tables)
  core/             # config.py: pydantic-settings BaseSettings; security.py: hashing, JWT
  db/session.py     # async engine + async_sessionmaker
tests/conftest.py    # fixtures: app, client, dependency_overrides
```
Small services keep everything in one `main.py`; more than a handful of routes → split into `routers/` +
`schemas/` + `dependencies.py` from the start — retrofitting later means a large mechanical diff.

### Project shape (Flask)
```
app/__init__.py     # create_app() factory: config, extensions.init_app(app), register_blueprint(...)
app/extensions.py    # db = SQLAlchemy(), migrate = Migrate() — instantiated with no app yet
app/blueprints/<name>/routes.py   # Blueprint(name, __name__); @bp.route(...)
app/models.py
config.py            # Config / DevConfig / ProdConfig, read from env
tests/conftest.py     # app = create_app(TestConfig); client = app.test_client()
```

## 3. Core idioms
### Pydantic v2 models & validation
```python
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

class UserCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 12:
            raise ValueError("password must be at least 12 characters")
        return v

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # read from ORM objects, not just dicts
    id: int
    email: EmailStr
```
Use `model_validate(obj)` (not `parse_obj`), `model_dump()`/`model_dump(mode="json")` (not `.dict()`), and
`ConfigDict(from_attributes=True)` (not `orm_mode=True`, the v1 name) to build a response model straight from an ORM
instance. `EmailStr`/`SecretStr`/`AnyUrl` and constrained types (`Annotated[int, Field(gt=0)]`) push validation into
the type instead of hand-written `if` checks.

### Dependencies: `Depends`, chaining, `yield`
```python
from typing import Annotated
from fastapi import Depends

async def get_db() -> AsyncIterator[AsyncSession]:
    async with async_session() as session:
        yield session

async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    ...  # decode token, look up user, raise HTTPException(401) if invalid

DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

@router.get("/me")
async def read_me(user: CurrentUser) -> UserOut:
    return user
```
Dependencies can themselves declare `Depends(...)` params — FastAPI builds the graph and resolves each one once per
request (cached; pass `use_cache=False` to force re-evaluation). Alias a common `Annotated[...]` as a module-level
name (`DbSession`, `CurrentUser` above) to avoid repeating the type + `Depends(...)` pair in every route. Code after
`yield` runs as teardown and, since 0.106, can catch exceptions from the route — but that teardown runs *before*
`BackgroundTasks` execute, so a yielded session is unsafe to hand into one; pass an ID and re-open it in the task.

### `async def` vs `def` — the blocking-call trap
```python
# wrong: sync DB driver call inside async def blocks the whole event loop
@app.get("/users/{id}")
async def get_user(id: int):
    return sync_db_session.query(User).get(id)

# fix 1: make the route a plain def — FastAPI runs it in a threadpool
@app.get("/users/{id}")
def get_user(id: int):
    return sync_db_session.query(User).get(id)

# fix 2: use an async-native driver/session and await it
@app.get("/users/{id}")
async def get_user(id: int, db: DbSession):
    return await db.get(User, id)
```
Rule of thumb: if the function body contains anything that is not `await`-ed async I/O (a sync ORM call, `requests`,
`time.sleep`, CPU-bound work), make it `def`, not `async def`. FastAPI threadpools `def` routes/dependencies
automatically; there is no threadpool safety net for `async def`.

### Lifespan: startup/shutdown
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.engine = create_async_engine(settings.database_url)
    app.state.session_factory = async_sessionmaker(app.state.engine, expire_on_commit=False)
    yield
    await app.state.engine.dispose()

app = FastAPI(lifespan=lifespan)
```
`@app.on_event(...)` is deprecated — no ordering guarantee against yield-dependencies, no single place to hold
shutdown references. `lifespan` is where shared, expensive resources (DB engine, ML model, HTTP client pool) open
once and are guaranteed to close.

### `APIRouter` structure and `response_model`
```python
# routers/users.py
router = APIRouter(prefix="/users", tags=["users"])

@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: int, db: DbSession) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user  # response_model filters this ORM object down to UserOut's fields

# main.py
app.include_router(router)
```
`response_model=` (or an introspectable return type) both documents the OpenAPI schema and filters the return value
— without it, a route returning a raw ORM object/dict leaks whatever fields it has (e.g. a password hash).

### Error handlers
```python
class ItemNotFoundError(Exception):
    def __init__(self, item_id: int):
        self.item_id = item_id

@app.exception_handler(ItemNotFoundError)
async def item_not_found_handler(request: Request, exc: ItemNotFoundError):
    return JSONResponse(status_code=404, content={"detail": f"Item {exc.item_id} not found"})
```
Raise domain exceptions from business logic and translate them once, centrally, instead of scattering
`raise HTTPException` through every route — keeps HTTP concerns out of the domain layer, one place for consistent
error bodies. `RequestValidationError`/`HTTPException` already have default handlers; override
`exception_handler(RequestValidationError)` only to reshape the 422 body, not to change validation.

### Auth: OAuth2 + JWT pitfalls
```python
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
password_hash = PasswordHash.recommended()  # pwdlib, argon2

def create_access_token(data: dict, expires_delta: timedelta) -> str:
    to_encode = data | {"exp": datetime.now(timezone.utc) + expires_delta}
    return jwt.encode(to_encode, settings.secret_key, algorithm="HS256")

async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: DbSession) -> User:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        username = payload.get("sub")
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Could not validate credentials",
                             headers={"WWW-Authenticate": "Bearer"})
    user = await get_user_by_username(db, username)
    if user is None:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    return user
```
Pitfalls: set and check `exp` on encode (`decode` only rejects expiry if it was set); compare against a dummy hash
even for a nonexistent user (`verify_password(pw, DUMMY_HASH)`) so login timing can't reveal valid usernames; keep
PII out of the payload — it's base64, not encrypted; use `Security(get_current_user, scopes=[...])` over hand-rolled
role strings once you need more than one permission level; never accept `alg: none` — pin `algorithms=["HS256"]`.

### SQLAlchemy 2.0 sessions (async)
```python
# db/session.py
engine = create_async_engine(settings.database_url, pool_pre_ping=True)
async_session = async_sessionmaker(engine, expire_on_commit=False)

async def get_db() -> AsyncIterator[AsyncSession]:
    async with async_session() as session:
        yield session

# models/user.py
class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
```
Use 2.0-style `Mapped[...]`/`mapped_column(...)` (not legacy `Column(...)` class attributes) and
`select(...)`/`session.execute(...)`/`session.scalars(...)` (not `session.query(...)`, still present but legacy).
`expire_on_commit=False` lets you read attributes after `commit()` without a round trip — needed since the response
is serialized right after the route returns. One engine per process (`lifespan`); one session per request (`get_db`).

### Settings with pydantic-settings
```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")
    database_url: str
    secret_key: str
    debug: bool = False

settings = Settings()  # reads env vars / .env at import time, validated and typed
```
`pydantic-settings` is a separate package (it was `pydantic.BaseSettings` in v1) — install it explicitly. Override
in tests via `app.dependency_overrides[get_settings] = lambda: Settings(...)`, not by mutating the module-level
`settings` object, which leaks between tests.

### Testing: `TestClient` and `httpx.AsyncClient`, dependency overrides
```python
# conftest.py
@pytest.fixture
def client():
    app.dependency_overrides[get_db] = override_get_db  # in-memory/test DB session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

def test_read_user(client):
    response = client.get("/users/1")
    assert response.status_code == 200
```
```python
# an async test that needs to await other async code
@pytest.mark.anyio
async def test_root():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/")
    assert response.status_code == 200
```
`TestClient` (Starlette's, sync) works for both `def` and `async def` routes and is the default — reach for
`httpx.AsyncClient`+`ASGITransport` only when the *test function itself* needs `await`. `with TestClient(app) as c:`
triggers `lifespan`; a bare `AsyncClient(transport=ASGITransport(...))` does **not** — wrap with `asgi-lifespan`'s
`LifespanManager` if lifespan-created state is needed. Always clear `dependency_overrides` after each test.

## 4. Error handling
- Validate at the boundary (Pydantic models on the request) and raise `HTTPException`/a domain exception as soon as
  a precondition fails — don't let `None`/malformed data travel deeper into the call stack.
- Raise a small set of domain exceptions (`ItemNotFoundError`, `PermissionDeniedError`) from service/repository
  functions and translate them to HTTP status in one `@app.exception_handler(...)` per type — keeps route bodies
  free of `try/except HTTPException` boilerplate.
- `RequestValidationError` (422) already reports which field failed and why — don't re-raise it as a generic 400
  that throws away the per-field detail.
- Never swallow an exception silently in a `yield`-dependency's `except` clause — re-raise as an `HTTPException` (or
  propagate it) so the client sees a real error instead of a route that "worked" with half-initialized state.

## 5. Testing
- Unit: pytest, plain `assert`, fixtures in `conftest.py`. Override dependencies (`app.dependency_overrides`)
  instead of monkeypatching module internals — the same seam FastAPI itself resolves at request time.
- Integration: a real test database (Postgres/SQLite fixture, same engine as prod) with real migrations run per
  test session/module — don't mock the DB layer for anything beyond a pure unit test.
- E2E: Playwright (or `pytest` + `httpx.AsyncClient`) against a running app for flows that cross processes (a
  frontend calling the API, webhooks). Keep these few and thorough; push the bulk of coverage to unit/integration.
- Flask: `app.test_client()` from an app built by `create_app(TestConfig)` — never test the module-level `app`
  singleton if the project also exposes a factory; a per-test app instance avoids cross-test config bleed.

## 6. Performance
- Default to `async def` only where the body is genuinely async I/O; a mis-classified blocking call in `async def`
  serializes every concurrent request behind it — the single most common FastAPI performance bug.
- Reuse one engine/connection pool per process (built in `lifespan`), not one per request — a new pool per request
  exhausts DB connections under load.
- Batch/parallelize independent awaited calls with `asyncio.gather(...)` instead of sequential `await`s.
- Paginate list endpoints (`offset`/`limit` or keyset) — never return an unbounded `SELECT *` as JSON.
- Avoid N+1 from lazy-loaded relationships: use `selectinload()`/`joinedload()` explicitly, and check the SQL
  actually issued on a slow endpoint (`echo=True` locally).
- Flask: async views don't raise how many requests run concurrently (still WSGI, one worker per in-flight request)
  — scale with workers/processes (`gunicorn -w N`), not by sprinkling `async def` on views.

## 7. Security
- Validate every body/query/path param through a Pydantic model or FastAPI's own param types — never read
  `request.query_params`/`request.json()` directly in a route with typed params, and never trust a client-supplied
  ID without checking the current user is authorized for that resource.
- Hash passwords with `pwdlib` (argon2) or another modern KDF — never plaintext or a fast general-purpose hash
  (MD5/SHA-256 alone).
- Keep JWT secrets out of source (env var via `pydantic-settings`), pin the algorithm on every `decode()` call, set
  and check expiry, and put minimal claims in the payload — it is signed, not encrypted.
- Parameterize all SQL; never format user input into a query string, in the ORM or in raw `text()` SQL.
- CORS: set an explicit `allow_origins` list in `CORSMiddleware` — `["*"]` with `allow_credentials=True` is invalid
  per spec and a real information-disclosure risk if a browser/proxy accepts it anyway.
- Rate-limit or otherwise protect auth endpoints (`/token`, `/login`) — neither framework does this by default.

## 8. Concurrency / async
- One event loop per process handles all `async def` work — a single blocking call inside it stalls every other
  in-flight request, not just the one that made the call.
- `def` routes/dependencies run in a bounded threadpool — CPU-bound `def` work still contends for those threads;
  offload real CPU work to a process pool or a background worker (Celery/RQ/arq), not more threads.
- `BackgroundTasks` run after the response is sent, in-process — fine for fire-and-forget (email, audit log); for
  anything that must survive a restart or needs retries, use a real task queue.
- `asyncio.gather(...)` for independent awaits; `asyncio.TaskGroup()` (3.11+) to cancel siblings on one failure.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| Blocking call (sync driver, `requests`, `sleep`) in `async def` | stalls the loop for every concurrent request | `def` (auto-threadpooled) or `asyncio.to_thread`/async client |
| Route returns raw ORM object/dict, no `response_model` | leaks fields (e.g. password hash), no OpenAPI schema | set `response_model=`/typed return |
| Yielded DB session passed into `BackgroundTasks` | teardown runs before the task — may already be closed | pass an ID; open a fresh session in the task |
| `@app.on_event("startup")` | deprecated, no ordering vs. yield-dependencies | `lifespan` async context manager |
| Pydantic v1 syntax (`parse_obj`, `.dict()`, `@validator`, `orm_mode`) on v2 | raises or silently no-ops | `model_validate`, `model_dump`, `field_validator`, `ConfigDict` |
| Hand-rolled `os.environ[...]` reads scattered in code | untyped, unvalidated, config scattered | `pydantic_settings.BaseSettings` |
| SQL built with f-string/`%`/`+` from user input | SQL injection | parameterized query / ORM builder |
| `jwt.decode` without pinning `algorithms=` | accepts `alg: none`/attacker-chosen alg | explicit `algorithms=[...]` |
| `CORSMiddleware(allow_origins=["*"], allow_credentials=True)` | invalid per spec; CORS bypass risk | explicit origin allow-list, drop credentials |
| Flask module-level global `app`, no factory | can't build isolated instance per test/config | `create_app()` factory + `Blueprint`s |
| `session.query(...)` / legacy `Column()` in new code | 1.x-era API, not 2.0 idiom | `select(...)`/`Mapped[...]`/`mapped_column(...)` |

## 10. Review checklist
- [ ] every `async def` route/dependency has only awaited async I/O — no sync DB/HTTP/file/`sleep` calls
- [ ] every data-returning route sets `response_model=` (or a typed return) — nothing returns a raw ORM row/dict
- [ ] shared resources (DB engine, HTTP client pool) open/close via `lifespan`, not `on_event`
- [ ] no yielded resource (DB session, file handle) is handed into `BackgroundTasks`
- [ ] Pydantic models use v2 APIs only (`model_validate`/`model_dump`/`field_validator`/`ConfigDict`)
- [ ] config comes from `pydantic_settings.BaseSettings`; no bare `os.environ` reads in route/service code
- [ ] all SQL is parameterized; relationships needing eager loading use `selectinload`/`joinedload` (no accidental N+1)
- [ ] JWT `decode()` pins `algorithms=`; secrets from settings, never hardcoded; auth endpoints are rate-limited
- [ ] CORS origins are an explicit allow-list (never `"*"` with credentials)
- [ ] new behavior has a test using `dependency_overrides` (not monkeypatched internals), cleared after each test
- [ ] `node .agents/scripts/verify.mjs --only python` (ruff, mypy/pyright if configured, pytest) passes

## 11. References
- FastAPI: `/` · `/release-notes/` (0.142.1, 2026-09-29) · `/tutorial/dependencies/dependencies-with-yield/` ·
  `/advanced/advanced-dependencies/` · `/advanced/events/` (lifespan) · `/tutorial/background-tasks/` ·
  `/advanced/security/oauth2-scopes/` · `/advanced/settings/` · `/tutorial/sql-databases/` · `/tutorial/testing/` ·
  `/advanced/async-tests/` · `/how-to/migrate-from-pydantic-v1-to-pydantic-v2/` — all under https://fastapi.tiangolo.com
- Pydantic docs https://docs.pydantic.dev/latest/ · SQLAlchemy 2.0 asyncio
  https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html
- Flask https://flask.palletsprojects.com/: `/en/stable/patterns/appfactories/` · `/en/stable/blueprints/` ·
  `/en/stable/async-await/`
- Principles: `.agents/guides/principles/` — `security.md`, `testing-strategy.md`, `performance.md`,
  `concurrency.md`, `api-design.md`, `database-design.md`
