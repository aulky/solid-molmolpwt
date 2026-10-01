# Python — engineering guide
> Scope: application, service and library code on CPython 3.10+; read with the quick card `.agents/rules/lang-python.md`.
> Last verified: 2026-09 — CPython What's New 3.13/3.14/3.15 + devguide status page; uv, ruff, mypy, pyright, pytest, pydantic docs/changelogs. Every code sample ran on CPython 3.14.7 and passes ruff 0.16.9, mypy 2.3.1 `--strict`, pyright 1.1.414, pytest 9.1.1 (tool versions re-confirmed live via `uvx <tool> --version` on 2026-09-28; this machine's installed interpreter is 3.14.2 — samples are 3.14.2-compatible too, nothing here needs .7).

## 1. Mental model / philosophy
- Python checks types only when a tool does. Treat the type checker as your compiler, ruff as your bug linter, pytest as the spec; done means all three are clean.
- Parse at the edges, trust the core: validate untrusted input (HTTP, JSON, env, files) once, at the boundary, into typed objects. Core logic takes typed values and does not re-validate.
- Readable beats clever: flat functions, early returns, stdlib first. A new dependency needs a reason no stdlib module meets.
- The version floor is `requires-python` in `pyproject.toml`; check it before using syntax from the table in §2.
- Principles: `.agents/guides/principles/` (`simplicity.md`, `design-principles.md`, `error-handling.md`, `testing-strategy.md`, `security.md`, `concurrency.md`).

## 2. Project structure & tooling
```text
pyproject.toml     # metadata, dependencies, all tool config
uv.lock            # committed; written only by uv
src/acme_orders/   # src layout: tests import the installed package
    __init__.py
    py.typed       # libraries: marks the package as typed
tests/
    conftest.py
    test_pricing.py
```

```toml
[project]
name = "acme-orders"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["pydantic>=2"]

[dependency-groups]
dev = ["pytest>=9", "ruff", "mypy"]

[build-system]  # uv init --package writes uv_build instead; keep what exists
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.ruff.lint]
extend-select = ["B", "UP", "I", "SIM", "S", "G", "PTH", "ASYNC", "DTZ", "T20", "RUF"]

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S101"]  # assert is the pytest idiom
"**/cli.py" = ["T20"]  # print is the CLI's output

[tool.mypy]
strict = true
files = ["src", "tests"]

[tool.pytest]  # native TOML needs pytest >= 9; older: [tool.pytest.ini_options]
addopts = ["-ra"]
testpaths = ["tests"]
strict = true  # strict markers/config/xfail/ids; only with a locked pytest
```

| Task | uv (when `uv.lock` exists) | Without uv |
|---|---|---|
| New project | `uv init --package acme-orders` · `uv init --app` | `python -m venv .venv` |
| Add dependency | `uv add pydantic` · dev: `uv add --dev pytest` | `python -m pip install pydantic` + edit `pyproject.toml` |
| Install the lock | `uv sync` · CI: `uv sync --locked` (fails on a stale lock) | `python -m pip install -e .` |
| Run a tool | `uv run pytest -q` (locks + syncs first) | venv python `-m pytest -q` (`Scripts/` Windows, `bin/` POSIX) |
| Upgrade one package | `uv lock --upgrade-package pydantic`, then `uv sync` | `python -m pip install -U pydantic` |
| Pin the interpreter | `uv python install 3.14` · `uv python pin 3.14` | python.org installer |

- NEVER edit `uv.lock` by hand or `pip install` into a uv venv — the next `uv sync` removes unknown packages.
- Activation is optional (PowerShell `.venv/Scripts/Activate.ps1`, POSIX `source .venv/bin/activate`); calling the venv interpreter directly avoids execution-policy and shell differences.
- Windows: the command is `python` (`python3` may be a Store stub). Scripts printing non-ASCII need `PYTHONUTF8=1` (PowerShell `$env:PYTHONUTF8 = "1"`, POSIX `export PYTHONUTF8=1`).
- Ruff: `ruff check --fix .` then `ruff format .`. Ruff 0.16 grew the default rule set from 59 to 413 rules; `extend-select` adds to whichever default is active. It also formats Python blocks in `*.md` by default — if `ruff format --check .` flags this kit's guides, add `extend-exclude = [".agents"]` under `[tool.ruff]`.
- Type checker: run the one the project configures; never add a second. mypy 2.x made `--local-partial-types` and `--strict-bytes` defaults. Legacy modules: `[[tool.mypy.overrides]]` with `module = ["pkg.legacy.*"]`, `ignore_errors = true` (`strict` is global-only). Pyright: `[tool.pyright]` or `pyrightconfig.json` (JSON wins), `typeCheckingMode` `standard` (default) or `strict`. Astral's `ty` is beta — do not switch to it unasked.

| Version | Status 2026-09 | Adds — use only if `requires-python` allows |
|---|---|---|
| 3.10 | security, EOL 2026-10 | `match`, `X \| Y`, `zip(strict=True)`, dataclass `slots`/`kw_only` |
| 3.11 | security | `Self`, `TaskGroup`, `asyncio.timeout`, `except*`, `add_note`, `tomllib`, `datetime.UTC` |
| 3.12 | security | PEP 695 `def f[T]`, `class C[T]`, `type X = ...`; `@override`; `itertools.batched` |
| 3.13 | bugfix | `TypeIs`, `ReadOnly`, `warnings.deprecated`, `copy.replace`; experimental free-threaded `python3.13t`; PEP 594 modules (`cgi`, `telnetlib`, ...) removed |
| 3.14 | bugfix, newest | deferred annotations (PEP 649/749, `annotationlib`); t-strings (PEP 750); free-threaded build supported (PEP 779), still opt-in `python3.14t`; `except A, B:`; tarfile default filter `"data"` |
| 3.15 | release candidate, final due 2026-10-01 | UTF-8 mode default (PEP 686), `lazy import` (PEP 810) — do not target yet |

## 3. Core idioms
### 3.1 Typing
```python
from dataclasses import dataclass, replace
from typing import Literal, Protocol, Self, assert_never, override

type Status = Literal["open", "paid", "void"]  # 3.12+ alias


@dataclass(frozen=True, slots=True, kw_only=True)
class Order:  # internal value object: immutable, cheap, typed
    id: str
    total_cents: int
    status: Status = "open"

    def paid(self) -> Self:
        return replace(self, status="paid")


class Repository[T](Protocol):  # structural: no base class needed
    def get(self, key: str) -> T | None: ...
    def add(self, key: str, item: T) -> None: ...


class InMemoryRepository[T]:  # satisfies Repository[T]; doubles as a fake
    def __init__(self) -> None:
        self._items: dict[str, T] = {}

    def get(self, key: str) -> T | None:
        return self._items.get(key)

    def add(self, key: str, item: T) -> None:
        self._items[key] = item


def describe(status: Status) -> str:
    match status:
        case "open" | "paid":
            return status
        case "void":
            return "cancelled"
        case _:
            assert_never(status)  # checker error when a status is unhandled


class Notifier:
    def send(self, message: str) -> None:
        raise NotImplementedError


class LogNotifier(Notifier):
    @override  # checker error if the base method is renamed
    def send(self, message: str) -> None:
        pass
```
- Annotate every public function and attribute; let inference type locals.
- Depend on a `Protocol` (repository, clock, HTTP client), not a concrete class: callers stay decoupled and tests pass a fake.
- `TypedDict` (+ `NotRequired`) types dicts you receive but do not own; dataclasses model objects you own.
- Prefer `object` plus narrowing (`isinstance`, `TypeIs`) over `Any`; `cast()` only with a comment saying why it holds.
- Forward references work unquoted on 3.14+ (lazy annotations). With a lower floor, quote them or keep `from __future__ import annotations`. Runtime readers call `annotationlib.get_annotations()` (3.14+) or `typing.get_type_hints()`, not `__annotations__`.
- `.pyi` stubs hold signatures with `...` bodies; update them in the same change as the code.

### 3.2 Choosing a data container
| Need | Use | Why |
|---|---|---|
| Internal value or entity | `@dataclass(frozen=True, slots=True)` | stdlib, fast, hashable when frozen |
| Untrusted input, JSON in/out | pydantic v2 `BaseModel` | per-field errors, JSON Schema |
| Settings from env | `pydantic-settings` `BaseSettings` | validated once at startup |
| A dict you pass through | `TypedDict` | zero runtime cost |
| Fixed set of values | `enum.StrEnum` (3.11) or `Literal` | exhaustive `match` |

```python
from pydantic import BaseModel, ConfigDict, Field, field_validator


class OrderIn(BaseModel):  # boundary model: validates untrusted input
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(min_length=1)
    total_cents: int = Field(ge=0)
    email: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        if "@" not in value:
            raise ValueError("not an email address")
        return value.strip().lower()
```
Pydantic v1 → v2: `parse_obj` → `model_validate`, `parse_raw` → `model_validate_json`, `.dict()` → `model_dump()`, `.json()` → `model_dump_json()`, `@validator` → `@field_validator`, `@root_validator` → `@model_validator`, `class Config` → `model_config = ConfigDict(...)`, `orm_mode` → `from_attributes=True`. Pydantic v1 does not run on 3.14+.

### 3.3 Resources, EAFP, context managers
```python
import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager

logger = logging.getLogger(__name__)


@contextmanager
def timed(label: str) -> Iterator[None]:
    start = time.perf_counter()
    try:
        yield
    finally:  # runs on success, error and cancellation
        logger.info("%s took %.3fs", label, time.perf_counter() - start)
```
- Files, locks, connections and temp dirs live in `with` blocks; `contextlib.ExitStack` when the count is dynamic.
- EAFP: `try: text = path.read_text(encoding="utf-8")` / `except FileNotFoundError:` beats `if path.exists():`, which races. Keep the `try` body to the one call that can fail.
- `pathlib.Path` everywhere: `base / "data" / name`, `.read_text(encoding="utf-8")`, `.glob("*.json")`, `.is_relative_to()`.

### 3.4 Logging, not print
- One `logger = logging.getLogger(__name__)` per module. Configure once in the entry point (`logging.basicConfig` or `logging.config.dictConfig`); libraries never add handlers.
- Lazy arguments: `logger.info("loaded %d orders", n)` (ruff `G004` flags f-strings). Context via `extra={"order_id": oid}`.
- Inside `except`, `logger.exception("...")` records the traceback. Never log secrets, tokens or raw request bodies.
- `print` only for a CLI's real output (ruff `T20`).

### 3.5 Iteration and strings
- Comprehensions for simple map/filter; a loop when there are side effects or more than two clauses. Generators for streams; `itertools.batched(rows, 500)` (3.12) for chunks.
- `enumerate`, `zip(strict=True)`, `dict.get`, `collections.Counter`/`defaultdict`, `"".join(parts)`.
- f-strings build text. t-strings (3.14+) build a `Template` that a library processes first — for SQL, HTML or shell escaping:

```python
from string.templatelib import Interpolation, Template


def to_sql(query: Template) -> tuple[str, list[object]]:
    sql: list[str] = []
    params: list[object] = []
    for part in query:  # str segments and Interpolation objects, in order
        if isinstance(part, Interpolation):
            sql.append("?")
            params.append(part.value)
        else:
            sql.append(part)
    return "".join(sql), params


name = "O'Brien"
sql, params = to_sql(t"SELECT id FROM users WHERE name = {name}")
# sql == "SELECT id FROM users WHERE name = ?", params == ["O'Brien"]
```

## 4. Error handling
```python
class OrdersError(Exception):
    """Base class for every error this package raises on purpose."""


class OrderNotFound(OrdersError):
    def __init__(self, order_id: str) -> None:
        super().__init__(f"order {order_id!r} not found")
        self.order_id = order_id
```
- One base exception per package; callers catch `OrdersError`, not `Exception`.
- Catch the narrowest type near the failing call. Translate at layer boundaries with `raise OrderFileError(...) from err`; `from None` only when the cause is noise.
- Unexpected exceptions propagate to one top-level handler (CLI `main`, framework error handler) that calls `logger.exception` and returns exit code 1 / HTTP 500.
- `err.add_note("while importing batch 7")` (3.11+) adds context without wrapping. `TaskGroup` raises `ExceptionGroup`: handle it with `except* TimeoutError as group:`.
- `assert` is not validation (`python -O` strips it): raise `ValueError`/`TypeError`.
- `return`/`break`/`continue` in `finally` swallows the in-flight exception (`SyntaxWarning` since 3.14).

## 5. Testing
Default: pytest. Only if the project already uses `unittest` classes, follow that style.
```python
import pytest

from acme_orders.pricing import apply_discount


@pytest.mark.parametrize(
    ("total", "percent", "expected"),
    [(1000, 10, 900), (999, 0, 999), (1, 50, 1)],
    ids=["ten-percent", "zero-percent", "rounds-discount-down"],
)
def test_apply_discount(total: int, percent: int, expected: int) -> None:
    assert apply_discount(total, percent) == expected


@pytest.mark.parametrize("percent", [-1, 101])
def test_apply_discount_rejects_out_of_range(percent: int) -> None:
    with pytest.raises(ValueError, match="percent must be 0-100"):
        apply_discount(1000, percent)
```
- Fixtures live in `conftest.py` and return ready objects. Built-ins: `tmp_path` (files), `monkeypatch` (`setenv`, `setattr`), `caplog` (logs), `capsys` (stdout).
- Fakes over mocks: `InMemoryRepository` satisfies `Repository` with no patching. If you must mock, use `unittest.mock.create_autospec(Cls, instance=True)` and patch the name where it is looked up, not where it is defined.
- Assert behaviour (return values, raised errors, `excinfo.value.__cause__`), not private calls.
- Async: simple cases call `asyncio.run(...)` in a sync test; async fixtures need the project's plugin — pytest-asyncio (`@pytest.mark.asyncio`) or anyio (`@pytest.mark.anyio`).
- Invariants of pure functions: hypothesis, e.g. `@given(st.integers(min_value=0), st.integers(0, 100))` asserting `0 <= apply_discount(t, p) <= t`.
- No network, real clock or shared globals in unit tests: inject a clock/client, use `tmp_path`, seed randomness.
- Commands: `pytest -q` · `pytest tests/test_pricing.py::test_apply_discount` · `pytest -k discount` · `pytest --lf -x` (last failures, stop at first) · `pytest --cov=acme_orders` (needs pytest-cov). Prefix `uv run` in uv projects.

## 6. Performance
Measure before changing anything:
```text
python -m cProfile -s cumtime -m acme_orders.cli orders.json
python -m timeit -s "xs = list(range(10_000))" "sum(xs)"
python -X importtime -c "import acme_orders"
```
- Algorithms first: `set`/`dict` membership is O(1), list membership O(n); `collections.deque` for queues, `heapq` for top-k, `bisect` for sorted lookups.
- Remove per-item I/O: batch queries (no N+1), reuse HTTP sessions and pools, stream big files line by line.
- `functools.cache`/`lru_cache(maxsize=...)` for pure functions of hashable args — not on methods, the cache keeps `self` alive (ruff `B019`).
- `slots=True` for millions of small objects; `"".join()` over `+=` in loops.
- CPU-bound: vectorize (NumPy, Polars) or `ProcessPoolExecutor`. The free-threaded build (`uv python install 3.14t`) runs threads in parallel at a single-digit-percent single-thread cost, and re-enables the GIL for extensions without support — check `sys._is_gil_enabled()`.
- Slow CLI startup: find heavy imports with `-X importtime`; import them inside the function that needs them.

## 7. Security
```python
import subprocess
from pathlib import Path


def git_log(ref: str) -> str:
    result = subprocess.run(  # argv list: no shell ever parses `ref`
        ["git", "log", "--oneline", "-n", "5", ref],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    return result.stdout


def safe_join(base: Path, user_path: str) -> Path:
    root = base.resolve()
    target = (root / user_path).resolve()
    if not target.is_relative_to(root):
        raise PermissionError(f"path escapes {root}: {user_path}")
    return target
```
- Injection: SQL parameters (`conn.execute("... WHERE name = ?", (name,))`, ORM raw queries too); argv lists, never `shell=True` or `os.system`. Ruff `S603` flags every `subprocess` call — once checked, `# noqa: S603` plus the reason.
- Deserialization: never `pickle`, `marshal`, `shelve`, `yaml.load`, `eval`, `exec` on untrusted bytes. Use `json`, `yaml.safe_load`, `ast.literal_eval`, pydantic.
- Secrets: `secrets.token_urlsafe()` (not `random`); `hmac.compare_digest` to compare; argon2/bcrypt for passwords. Load from env or a secret manager (`pydantic.SecretStr` hides reprs); never log them.
- Files: check user paths (`safe_join`); `tarfile` `filter="data"` (default since 3.14; pass it on 3.12/3.13); `tempfile.NamedTemporaryFile`/`mkstemp`, never `mktemp`; untrusted XML via `defusedxml`.
- HTTP clients: always `timeout=`; keep TLS verification on; allow-list hosts for user-supplied URLs (SSRF).
- Supply chain: commit `uv.lock`, CI runs `uv sync --locked`; audit with `uv export --format requirements.txt --no-hashes --no-emit-project -o requirements-audit.txt` then `uvx pip-audit -r requirements-audit.txt`. Check a package's name and maintainer before `uv add`.

## 8. Concurrency / async
| Workload | Use |
|---|---|
| Many concurrent network calls | asyncio: `TaskGroup` + `Semaphore` + `timeout` |
| A blocking call inside async code | `await asyncio.to_thread(fn, *args)` |
| Blocking I/O in sync code | `ThreadPoolExecutor` |
| CPU-bound | `ProcessPoolExecutor`; free-threaded threads if all deps support it; `InterpreterPoolExecutor` (3.14) |

```python
import asyncio


async def fetch(item_id: int) -> str:
    await asyncio.sleep(0.01)  # stand-in for real async I/O (httpx, asyncpg)
    return f"item-{item_id}"


async def fetch_all(ids: list[int], limit: int = 10) -> list[str]:
    semaphore = asyncio.Semaphore(limit)  # bound concurrency

    async def bounded(item_id: int) -> str:
        async with semaphore:
            return await fetch(item_id)

    async with asyncio.timeout(5):  # one deadline for the whole batch
        async with asyncio.TaskGroup() as tg:  # a failure cancels siblings
            tasks = [tg.create_task(bounded(i)) for i in ids]
    return [task.result() for task in tasks]
```
- Every network await needs a deadline (`asyncio.timeout` or the client's timeout).
- Never swallow `asyncio.CancelledError` (a `BaseException`): clean up in `finally`, or re-raise.
- Keep a reference to every task — a bare `create_task(...)` can be garbage-collected mid-flight (ruff `RUF006`); `TaskGroup` handles it.
- Call `asyncio.run()` once, at the entry point, never inside a running loop.
- Guard shared read-modify-write state with `threading.Lock`, also on free-threaded builds: built-in containers stay consistent, compound operations are not atomic.
- Request-scoped state (request id, user) goes in `contextvars.ContextVar`, not module globals.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix (ruff code) |
|---|---|---|
| `def f(items=[])` | default shared across calls | `items: list[T] \| None = None` (`B006`) |
| bare `except:` / `except Exception: pass` | hides bugs, catches Ctrl+C | specific exception + `from err` (`E722`, `BLE001`) |
| `raise X` in `except` without `from` | loses the cause | `raise X(...) from err` (`B904`) |
| f-string SQL, `shell=True` | injection | parameters, argv list (`S608`, `S602`) |
| `print` / `logger.info(f"...")` | no levels, eager format | module logger, `%s` args (`T201`, `G004`) |
| `open(p)` without `encoding`, `os.path.join` | locale encoding on Windows | `Path.read_text(encoding="utf-8")` (`PTH123`, `PTH118`) |
| `typing.List`, `Optional[X]` | legacy spelling | `list[X]`, `X \| None` (`UP006`, `UP045`) |
| `datetime.utcnow()`, naive `now()` | deprecated, timezone bugs | `datetime.now(UTC)` (`DTZ005`) |
| `time.sleep` in `async def` | blocks the event loop | `asyncio.sleep`, `to_thread` (`ASYNC251`) |
| `requests`/blocking HTTP call in `async def` | blocks the event loop | async client — httpx/aiohttp (`ASYNC210`) |
| fire-and-forget `create_task` | task may vanish silently | `TaskGroup` (`RUF006`) |
| pydantic v1 calls (`.dict()`, `parse_obj`) | old API, warnings | `model_dump()`, `model_validate()` |
| `pickle.load`/`yaml.load` on input | code execution | `json`, `yaml.safe_load` (`S301`, `S506`) |
| mocking everything | green tests, broken code | fakes behind a `Protocol`; `create_autospec` |
| bare `# type: ignore` / `# noqa` | hides future errors | `# type: ignore[code]  # reason` |
| `pip install` into global Python or a uv venv | drift, unreproducible | `uv add` / `uv sync` |

## 10. Review checklist
- [ ] Syntax and stdlib APIs fit `requires-python`
- [ ] Public API annotated; no new `Any`/`cast`/ignore without a reason; mypy or pyright clean
- [ ] `ruff check` and `ruff format --check` clean with the project's config
- [ ] Untrusted input validated once at the boundary; core takes typed values
- [ ] Package exception hierarchy, narrow `except`, `raise ... from err`, one top-level handler
- [ ] Module loggers with lazy args, no `print` diagnostics, no secrets in logs
- [ ] `with` + `pathlib` + `encoding="utf-8"`; no mutable defaults
- [ ] No SQL/shell string building, unsafe deserialization, disabled TLS checks or missing timeouts
- [ ] Async: no blocking calls, `TaskGroup` + deadlines, `CancelledError` not swallowed
- [ ] New behaviour tested (parametrized edge cases, error paths); fakes over mocks; no network
- [ ] Dependencies via `uv add` (or recorded in `pyproject.toml`); `uv.lock` never hand-edited
- [ ] `node .agents/scripts/verify.mjs --only python` passes

## 11. References
- What's New: https://docs.python.org/3/whatsnew/3.14.html · https://docs.python.org/3/whatsnew/3.13.html · https://docs.python.org/3/whatsnew/3.12.html
- Status: https://devguide.python.org/versions/ · typing: https://docs.python.org/3/library/typing.html · https://typing.python.org/en/latest/
- Free threading: https://docs.python.org/3/howto/free-threading-python.html · asyncio: https://docs.python.org/3/library/asyncio-task.html · logging: https://docs.python.org/3/howto/logging.html
- pyproject: https://packaging.python.org/en/latest/guides/writing-pyproject-toml/
- uv: https://docs.astral.sh/uv/ · ruff: https://docs.astral.sh/ruff/ · mypy: https://mypy.readthedocs.io/en/stable/ · pyright: https://github.com/microsoft/pyright/blob/main/docs/configuration.md
- pytest: https://docs.pytest.org/en/stable/ · pydantic: https://pydantic.dev/docs/validation/latest/ · pip-audit: https://github.com/pypa/pip-audit
