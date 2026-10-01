---
trigger: glob
globs: "**/*.py,**/*.pyi,**/pyproject.toml"
description: "Python quick card: toolchain, invariants, idioms, pitfalls. Loaded when editing .py/.pyi files or pyproject.toml."
---
# Python — quick card
Deep guide: `.agents/guides/languages/python.md` — read it before non-trivial Python work (new module, concurrency, public API, perf).
Principles: `.agents/guides/principles/error-handling.md`, `.agents/guides/principles/testing-strategy.md`, `.agents/guides/principles/security.md`.

## Toolchain (use the project's own config first)
- Run `python`, never `python3` (a broken Store stub on Windows). If `uv.lock` exists, prefix tools with `uv run` (it syncs the venv first).
- Format: `ruff format .` · Lint: `ruff check --fix .` · Types: `mypy` (or `pyright` if configured) · Test: `pytest -q` · All: `node .agents/scripts/verify.mjs --only python`
- Deps: `uv add <pkg>` / `uv add --dev <pkg>`. No uv: `python -m pip install <pkg>` inside the project venv, then add it to `pyproject.toml`.

## Invariants (MUST / NEVER — with reason → alternative)
1. MUST read `requires-python` before using new syntax — code must run on the oldest supported version. Floors: 3.11 `Self`, `TaskGroup`, `asyncio.timeout`, `except*` · 3.12 `type X = ...`, `def f[T]`, `@override` · 3.13 `TypeIs`, `ReadOnly` · 3.14 t-strings, unquoted forward refs.
2. NEVER install into the global interpreter — not reproducible, breaks other projects. Instead `uv sync`, or `python -m venv .venv` and call `.venv/Scripts/python` (Windows) / `.venv/bin/python` (POSIX).
3. NEVER use a mutable default (`def f(x=[])`) — one object is shared by every call. Instead `x: list[str] | None = None`; in dataclasses `field(default_factory=list)`.
4. NEVER write bare `except:` or `except Exception: pass` — hides bugs; bare also catches Ctrl+C. Instead catch the specific exception and `raise DomainError(...) from err`; log with `logger.exception` only at the top boundary.
5. NEVER build SQL or shell commands with f-strings/`%`/`+` — injection. Instead query parameters (`cur.execute("... WHERE id = ?", (id_,))`) and `subprocess.run([...], check=True)` with an argv list, no `shell=True`.
6. NEVER `print` diagnostics outside CLI output — no levels, lost in production. Instead `logger = logging.getLogger(__name__)`, `logger.info("x=%s", x)` (lazy args, not f-strings); configure logging once at the entry point.
7. MUST pass `encoding="utf-8"` when reading/writing text (`Path.read_text`, `open` inside `with`) — Windows defaults to the locale code page.
8. NEVER `pickle.load`, `yaml.load` or `eval` untrusted data — code execution. Instead `json`, `yaml.safe_load`, pydantic.
9. NEVER add `# type: ignore` / `# noqa` without the error code and a reason, e.g. `# type: ignore[attr-defined]  # stub lacks X`.

## Idioms & pitfalls Flash models get wrong
- Types: `list[str]`, `dict[str, int]`, `X | None` — not `typing.List`/`Optional`. `Iterable`, `Sequence`, `Mapping`, `Callable` come from `collections.abc`.
- Interfaces: `typing.Protocol` (structural) over ABC trees; `@override` on overrides; `Self` for methods returning the instance.
- Data: `@dataclass(frozen=True, slots=True)` inside; pydantic v2 at trust boundaries (`model_validate`, `model_dump`, `field_validator` + `@classmethod`, `model_config = ConfigDict(...)`). NEVER v1 APIs: `parse_obj`, `.dict()`, `@validator`, `class Config`.
- `pathlib.Path` (`/`, `.read_text`, `.glob`), not `os.path` string joins. `datetime.now(UTC)`, not deprecated naive `datetime.utcnow()`.
- EAFP: `try: v = d[k]` / `except KeyError:` instead of check-then-act; keep the `try` body to the one call that can fail.
- asyncio: no blocking calls in `async def` (`time.sleep`, `requests`, sync DB drivers) — use async clients or `await asyncio.to_thread(fn)`. Group work in `async with asyncio.TaskGroup()`, bound it with `asyncio.timeout(s)`; never drop a `create_task` result.
- `is None`, not `== None`; `if not items:`; `zip(a, b, strict=True)`; `enumerate` over index loops.
- No `from x import *`; no I/O or network at import time.
- Tests: pytest functions, plain `assert`, fixtures in `conftest.py`, `@pytest.mark.parametrize`, `tmp_path`, `monkeypatch`, `pytest.raises(E, match=...)`. Keep `unittest` only where the project uses it.

## Example — bad → good
```python
def load_users(path, cache={}):  # untyped; shared mutable default
    try:
        f = open(path)  # leaked handle, locale encoding
        return json.loads(f.read())
    except:  # swallows everything, even Ctrl+C
        print("failed")  # no level, no traceback
        return None  # caller cannot tell why
```

```python
def load_users(path: Path) -> list[User]:  # User is a pydantic model
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        raise UserLoadError(f"cannot read users from {path}") from err
    users = [User.model_validate(row) for row in raw]
    logger.info("loaded %d users from %s", len(users), path)
    return users
```

## Before finishing
- [ ] `ruff format` + `ruff check` clean · [ ] mypy/pyright clean, no new ignores · [ ] pytest covers the new behaviour and passes
- [ ] no `print`, bare `except`, mutable defaults, `shell=True`, missing `encoding=`, or syntax newer than `requires-python`
