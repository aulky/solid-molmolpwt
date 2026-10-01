# Rust — engineering guide
> Last verified: 2026-09 — stable 1.98.1 per RELEASES.md; examples compiled, clippy-clean and tested on 1.97.1 (edition 2024); crate versions from crates.io (tokio 1.53, tokio-util 0.7, thiserror 2, anyhow 1, proptest 1.11).
> Scope: writing, reviewing, testing Rust. Quick card: `.agents/rules/lang-rust.md` · web: `.agents/guides/frameworks/rust-web.md` · principles: `.agents/guides/principles/`.

## 1. Mental model / philosophy
- **Ownership:** every value has one owner. Passing or assigning by value *moves* it (unless the type is `Copy`). The value drops at the end of the owner's scope, so files, sockets and lock guards close deterministically (RAII).
- **Borrowing:** many `&T` XOR one `&mut T`, and no borrow outlives the owner. Think of it as a readers-writer lock checked at compile time.
- **Lifetimes** name regions and never extend a value's life. In a signature they say which input an output borrows from; elision covers most cases. A struct with a lifetime is a short-lived *view* (parser, iterator). Long-lived structs own their data.
- **When the borrow checker refuses** (E0499/E0502/E0505/E0597), the data flow is wrong. Fix it in this order:
  1. Shorten the borrow: compute into a local, then mutate.
  2. Use an intent API: `retain`, `entry`, `std::mem::take`, `split_at_mut`, `get_disjoint_mut` (1.86).
  3. Split the struct, or pass IDs/indices instead of references.
  4. Use `Arc`/`Rc` only for real shared ownership. Use `RefCell`/`Mutex` last.
- **Types carry invariants:** use enums for states, newtypes for IDs and units, `Option` instead of sentinels. Parse, don't validate: a `TryFrom` constructor returns `Result`, so an invalid value can never be held.
- **KISS/YAGNI:** start with concrete types. Add a generic when a second caller exists, and a trait only at a real seam (I/O, clock, external service).

## 2. Project structure & tooling
```text
Cargo.toml     # edition, rust-version, [features], [lints]
src/lib.rs     # logic lives here (testable); src/main.rs stays thin
tests/*.rs     # integration tests: public API only, one crate per file
tests/common/mod.rs  # shared helpers (not a test target)
```
In a workspace, share versions with `[workspace.dependencies]` (`serde.workspace = true`) and lints with `[workspace.lints]` (`[lints] workspace = true`). A virtual workspace must set `resolver = "3"` itself.

| Task | Command (PowerShell and POSIX) |
|---|---|
| Format / check | `cargo fmt --all` / `cargo fmt --all --check` |
| Lint (kit gate) | `cargo clippy --all-targets --all-features -- -D warnings` |
| Test | `cargo test --all-features`; one: `cargo test parse_ports -- --nocapture` |
| One file / doctests | `cargo test --test ports` / `cargo test --doc` |
| Add dependency | `cargo add serde --features derive` · `cargo add --dev proptest` |
| Feature origin / dupes | `cargo tree -e features -i tokio` / `cargo tree -d` |
| Everything | `node .agents/scripts/verify.mjs --only rust` |

On Cargo 1.97+, you can set `[build] warnings = "deny"` in `.cargo/config.toml` (or `CARGO_BUILD_WARNINGS=deny`). It denies warnings without invalidating the build cache, and the Clippy README now prefers it. The kit gate uses `-- -D warnings` because it works on every toolchain.

Manifest for a **new** crate. In an existing repo, keep its lint config and never add `pedantic` or deny-lints repo-wide unasked.
```toml
[package]
name = "inventory"
version = "0.1.0"
edition = "2024"
rust-version = "1.88" # MSRV; let chains need 1.88

[lints.rust]
unsafe_code = "forbid"

[lints.clippy]
unwrap_used = "warn" # the -D warnings gate makes these errors
expect_used = "warn"
dbg_macro = "warn"
todo = "warn"
```
Add `clippy.toml` with `allow-unwrap-in-tests = true` and `allow-expect-in-tests = true`.

**MSRV (`rust-version`)** is enforced: Cargo errors on older toolchains. Resolver 3 (implied by edition 2024) and `cargo add` prefer dependency versions compatible with it. Clippy's `msrv` defaults to it, so it won't suggest newer APIs.
- Verify it with `rustup toolchain install 1.88`, then `cargo +1.88 check --all-targets`, or run `cargo msrv verify` (cargo-msrv).
- Cargo treats raising MSRV as a minor incompatibility. Never raise it silently; list it in the report.

**Edition 2024** (stable since 1.85). These are the changes that break code written from memory:
- Unsafe markers: extern blocks are `unsafe extern "C" { ... }`, and `#[unsafe(no_mangle)]` / `export_name` / `link_section` need the `unsafe(...)` form. `unsafe_op_in_unsafe_fn` warns, so wrap operations in `unsafe {}` even inside an `unsafe fn`.
- References to `static mut` are denied. Use atomics, `Mutex`, `OnceLock` or `LazyLock` instead.
- `std::env::set_var`/`remove_var` are `unsafe`. Pass config explicitly instead of mutating env in tests.
- Temporaries drop sooner: `if let` temporaries drop before `else`, which fixes the `RwLock` read-then-write deadlock. Tail-expression temporaries drop before locals.
- RPIT (`-> impl Trait`) captures all in-scope lifetimes. Narrow it with `+ use<'a, T>` (1.82+).
- `gen` is reserved, `Future`/`IntoFuture` are in the prelude, and `boxed_slice.into_iter()` yields owned items.
- Cargo: resolver 3, and underscore keys (`default_features`, `dev_dependencies`) are removed.
- Rustdoc merges doctests into one binary; rustfmt uses style edition 2024.
- Migrate with `cargo fix --edition`, set `edition = "2024"`, then run fmt, clippy and test.

**Newer stable features (check the MSRV):** let chains (1.88, edition 2024), async closures (1.85), `#[expect(lint, reason = "...")]` (1.81), `LazyLock` (1.80) and `OnceLock` (1.70) instead of `lazy_static`/`once_cell`, trait upcasting (1.86), `Vec::extract_if` (1.87), `cfg_select!` (1.95).

## 3. Core idioms
**Parameters borrow, returns own:**
- text: `&str` → `String` (or `Cow<'_, str>` if the result is usually unchanged);
- lists: `&[T]` or `impl IntoIterator<Item = T>` → `Vec<T>`;
- paths: `impl AsRef<Path>` → `PathBuf`;
- values you store: `impl Into<String>`, so the caller moves instead of copying.
```rust
use std::borrow::Cow;
use std::collections::HashMap;

pub fn normalize_tabs(s: &str) -> Cow<'_, str> {
    if s.contains('\t') {
        Cow::Owned(s.replace('\t', "    ")) // allocate only when changing
    } else {
        Cow::Borrowed(s)
    }
}

pub fn word_counts(text: &str) -> HashMap<&str, usize> {
    let mut counts = HashMap::new();
    for word in text.split_whitespace() {
        *counts.entry(word).or_insert(0) += 1; // one lookup, no key clone
    }
    counts
}
```
**Iterators** compile to the same code as hand-written loops, without index panics.
- `.windows(2)`, `.zip()`, `.enumerate()`, `.copied()`;
- `.count()`, not `.collect::<Vec<_>>().len()`;
- `collect::<Result<Vec<_>, _>>()` stops at the first error.

**Option/Result flow:**
```rust
pub fn port_of(addr: &str) -> Option<u16> {
    let (_, port) = addr.rsplit_once(':')?; // ? works on Option too
    port.parse().ok()
}

pub fn greeting(session: &Session) -> String {
    let Some(user) = &session.user else {
        return "hello, guest".to_owned(); // let-else keeps the happy path flat
    };
    format!("hello, {}", user.name)
}

pub fn is_admin_named(session: &Session, name: &str) -> bool {
    // let chain: edition 2024 + Rust 1.88
    if let Some(user) = &session.user
        && user.admin
        && user.name == name
    {
        return true;
    }
    false
}
```
Also reach for `ok_or_else`, `map_err`, `and_then`, `unwrap_or_default`, `is_some_and` and `transpose`.

**Generics vs `dyn`.**
- **Generics** (`impl Trait`, `<T: Trait>`) are monomorphized: inlinable and fast, but more code.
- **`dyn Trait`** gives one copy and a vtable call. Use it for heterogeneous collections and plugin points: `Vec<Box<dyn Notifier + Send + Sync>>`.
- **Dyn compatibility:** a trait cannot be used as `dyn` if a method is generic, is `async fn`, or returns `impl Trait`. For async trait objects, return `Pin<Box<dyn Future<Output = T> + Send + '_>>` or use the `async-trait` crate.

**Clone costs.**
- `.clone()` on a `String`, `Vec` or `HashMap` copies the whole allocation.
- `Arc::clone(&cfg)` only bumps a refcount. Write it that way so the cost is visible (`clippy::clone_on_ref_ptr`).
- Take a field out of `&mut self` with `std::mem::take(&mut self.buf)` instead of cloning it.
- Derive `Copy` only for small plain values.
- `Rc` is `!Send`.

## 4. Error handling
**Library: `thiserror`** gives typed, matchable errors that carry their source.
```rust
use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
#[non_exhaustive] // adding a variant later is not a breaking change
pub enum ConfigError {
    #[error("cannot read config {}", path.display())]
    Read { path: PathBuf, #[source] source: std::io::Error },
    #[error("missing key `{0}`")]
    MissingKey(&'static str),
    #[error("invalid port")]
    Port(#[from] std::num::ParseIntError),
}

pub fn load_port(path: &Path) -> Result<u16, ConfigError> {
    let text = std::fs::read_to_string(path)
        .map_err(|source| ConfigError::Read { path: path.to_owned(), source })?;
    let raw = text
        .lines()
        .find_map(|line| line.strip_prefix("port="))
        .ok_or(ConfigError::MissingKey("port"))?;
    Ok(raw.trim().parse()?) // ParseIntError -> ConfigError::Port via #[from]
}
```
**Application: `anyhow`.** Add context at boundaries; returning `Err` from `main` prints the "Caused by" chain.
```rust
use anyhow::{Context, Result, bail};

fn run(path: &Path) -> Result<()> {
    let port = load_port(path)
        .with_context(|| format!("loading settings from {}", path.display()))?;
    if port < 1024 {
        bail!("port {port} is privileged; use 1024 or higher");
    }
    Ok(())
}
```
Rules:
- Use `#[from]` only when a source type maps to exactly one variant. Otherwise use `map_err` and add fields (path, id).
- Handle or propagate an error, never both. Log once, at the top.
- Panics are for bugs (broken invariants), never for input, I/O or network failures. Write `expect("<why it cannot fail>")` and `unreachable!("<why>")`.
- `Mutex::lock()` fails only if a holder panicked. Use `expect("state mutex poisoned")`, or `.unwrap_or_else(PoisonError::into_inner)` when the data stays valid.

## 5. Testing
- **Unit tests** go in `#[cfg(test)] mod tests { use super::*; ... }` next to the code and can use private items.
- **Integration tests** go in `tests/*.rs` and use the public API only.
- **Doc examples** in library crates are compiled and run by `cargo test`.
- **Error paths get tests too:** `assert!(matches!(err, ConfigError::MissingKey("port")))`.
- **Property tests** (proptest) find the edge cases examples miss:
```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn roundtrips_any_port_list(ports in proptest::collection::vec(any::<u16>(), 1..20)) {
        let text = ports.iter().map(u16::to_string).collect::<Vec<_>>().join(", ");
        prop_assert_eq!(demo::parse_ports(&text).unwrap(), ports);
    }
}
```
- **Async tests:** `#[tokio::test]`. For timers, use `#[tokio::test(start_paused = true)]`, which needs tokio's `test-util` feature in dev-dependencies. `sleep` then advances instantly, so there are no real waits and no flakes.
- **Fakes over mocks:** put a trait at the I/O seam and implement an in-memory fake in the tests.
- **Tools:**
  - `cargo nextest run` is faster but skips doctests, so also run `cargo test --doc`.
  - `cargo hack check --feature-powerset` (cargo-hack) checks feature combinations.
  - `cargo +nightly miri test` checks `unsafe` code.
- NEVER add `#[ignore]` or delete assertions to get green; the quality gate flags it.

## 6. Performance
Measure first: time only `--release` builds (debug is far slower), benchmark with criterion (`cargo bench`), profile with a sampling profiler (`samply`, `perf`, `cargo flamegraph`). Safe defaults:
- `Vec::with_capacity(n)`; reuse buffers with `clear()`; borrow slices; no clones in hot loops.
- `BufReader`/`BufWriter` for files and sockets, because every unbuffered write is a syscall.
- `write!(buf, ...)` into an existing `String` instead of `format!` plus push.
- `HashMap::entry` instead of `contains_key` then `insert`.
- A faster hasher only after profiling, and never for attacker-controlled keys (HashDoS).
- Box a large enum variant (`clippy::large_enum_variant`). Generics on hot paths; `dyn` where code size or compile time matters.
- Tune the release profile (`lto = "thin"`, `codegen-units = 1`) only with before/after numbers.
- In async code, long CPU work between `.await`s starves other tasks. Move it to `spawn_blocking` or rayon.

## 7. Security
**`unsafe` policy.** Forbid it by default (`unsafe_code = "forbid"`). Allow it only for FFI, or a benchmarked hot path where no safe std API or vetted crate (e.g. `bytemuck`, `zerocopy`) works. When allowed, it needs:
- the smallest possible block;
- a `// SAFETY:` comment (`clippy::undocumented_unsafe_blocks`);
- a `# Safety` doc section on each `pub unsafe fn` (`clippy::missing_safety_doc`);
- a safe wrapper;
- a Miri run and a reviewer.
```rust
/// Returns the first byte without a bounds check.
///
/// # Safety
/// `bytes` must be non-empty.
pub unsafe fn first_unchecked(bytes: &[u8]) -> u8 {
    // SAFETY: the caller guarantees `bytes` is non-empty (see `# Safety`).
    unsafe { *bytes.get_unchecked(0) }
}
```
**Untrusted input:**
- Bound every size (body, line, collection length).
- Use `checked_*` arithmetic and `try_from`, not `as`.
- Use `.get(..)`, not indexing: `&s[a..b]` panics off a char boundary, and in a server a panic is a DoS.
- Set `overflow-checks = true` in `[profile.release]` where wrapping would be a vulnerability.

**Injection:**
- SQL: bind parameters (`sqlx::query("SELECT * FROM users WHERE id = $1").bind(id)`), never `format!` SQL.
- Processes: `Command::new(prog).arg(value)`, never `sh -c` with interpolated input.
- Paths: canonicalize, then check `starts_with(base)`.

**Secrets:** no `#[derive(Debug)]` on structs that hold secrets. Write a redacting `Debug` impl or use a wrapper type, and never log tokens.

**Supply chain:**
- Run `cargo audit` (RustSec) and `cargo deny check` (advisories, licenses, bans, sources).
- `build.rs` and proc macros run code at build time, so review new dependencies. Prefer maintained, widely used crates, with `default-features = false` and only the features you need.
- Commit `Cargo.lock` for applications.

## 8. Concurrency / async
**`Send` and `Sync`:**
- `Send`: the value may move to another thread.
- `Sync`: `&T` may be shared across threads.
- `Rc` is neither. `Cell`/`RefCell` are `Send` but not `Sync`.

Share state with `Arc<T>` (reads), `Arc<Mutex<T>>`/`Arc<RwLock<T>>` (writes), atomics (counters), or channels (ownership hand-off, preferred). `std::thread::scope` borrows stack data without `Arc`.
```rust
use tokio::{sync::mpsc, task::JoinSet};
use tokio_util::sync::CancellationToken;

pub async fn worker(mut rx: mpsc::Receiver<String>, token: CancellationToken) -> usize {
    let mut handled = 0;
    loop {
        tokio::select! {
            () = token.cancelled() => break,       // shutdown requested
            msg = rx.recv() => match msg {         // recv() is cancel-safe
                Some(m) => handled += m.len(),
                None => break,                     // every sender dropped
            },
        }
    }
    handled
}

// CPU work -> blocking pool. join_next yields in completion order, so carry the index.
pub async fn checksums(inputs: Vec<Vec<u8>>) -> Result<Vec<u64>, tokio::task::JoinError> {
    let mut set = JoinSet::new();
    for (i, data) in inputs.into_iter().enumerate() {
        set.spawn_blocking(move || (i, data.iter().map(|&b| u64::from(b)).sum::<u64>()));
    }
    let mut out = vec![0; set.len()];
    while let Some(res) = set.join_next().await {
        let (i, sum) = res?; // Err = the task panicked or was aborted
        out[i] = sum;
    }
    Ok(out)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let token = CancellationToken::new();
    let (tx, rx) = mpsc::channel(64); // bounded = backpressure
    let task = tokio::spawn(worker(rx, token.child_token()));
    tx.send("job".to_owned()).await?;
    tokio::signal::ctrl_c().await?;
    token.cancel(); // ask every child to stop
    println!("handled {} bytes", task.await?);
    Ok(())
}
```
Rules:
- **`tokio::spawn` needs a `Send + 'static` future.** Move owned data in, and clone the `Arc` before `async move`. Holding an `Rc`, a `RefCell` borrow or a std `MutexGuard` across `.await` makes the future `!Send`.
- **Stopping tasks:** dropping a `JoinHandle` *detaches* the task; it keeps running. Use `abort()`, or a `JoinSet`, which aborts its tasks on drop. `spawn_blocking` work cannot be aborted once it starts.
- **Cancellation** means the future is dropped at an `.await`. `select!` branches in a loop must be cancel-safe: `Receiver::recv` and `AsyncReadExt::read` are, `read_exact` is not.
- **Timeouts:** wrap every network call in `tokio::time::timeout(dur, fut)`, which returns `Err(Elapsed)` on expiry.
- **Channels:** use bounded channels. Use unbounded ones only when the producer rate is bounded by design.
- **Mutexes:** std `Mutex` is fine, and faster, when the guard never crosses `.await`. Copy what you need inside a `{ }` block, then await. Use `tokio::sync::Mutex` only when the lock must be held across `.await`. `clippy::await_holding_lock` warns by default.
- **Nested runtimes:** never call `block_on` or build a runtime inside async code. It panics with "Cannot start a runtime from within a runtime".

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `.unwrap()` on I/O/parse in lib code | panic = crash/DoS | `Result` + `?` + typed error |
| `.clone()` to calm the borrow checker | hidden allocs, wrong ownership | shorter borrow, `mem::take`, restructure |
| `Rc<RefCell<T>>` everywhere | runtime borrow panics, `!Send` | single owner + `&mut`, or messages |
| `for i in 0..v.len() { v[i] }` | bounds panics, noise | `for x in &v`, `iter().enumerate()` |
| `String`/`Box<dyn Error>` lib errors | caller cannot match | `thiserror` enum |
| `x as u32` on untrusted input | silent truncation | `u32::try_from(x)?` |
| blocking call in async | stalls a worker | `tokio::time::sleep`, `spawn_blocking` |
| std guard across `.await` | `!Send`, deadlock | scope the guard / `tokio::sync::Mutex` |
| dropping a `JoinHandle` to stop a task | task keeps running | `abort()`, `JoinSet`, `CancellationToken` |
| `static mut`, `lazy_static!` | UB risk, extra dep | atomics, `OnceLock`, `LazyLock` |
| `#![allow(clippy::all)]` | hides real bugs | fix, or scoped `#[expect(.., reason)]` |
| non-additive feature (`no-std` removes API) | breaks unified builds | positive features (`std`), `dep:` deps |
| hand-edited `Cargo.lock`, guessed versions | broken resolution | `cargo add`, `cargo update -p <crate>` |

## 10. Review checklist
- [ ] fmt check, clippy `--all-targets --all-features -- -D warnings`, `cargo test --all-features` pass (or `node .agents/scripts/verify.mjs --only rust`).
- [ ] No `unwrap`/`expect`/`panic!`/`todo!`/`dbg!` on fallible paths outside tests; every `expect` states its invariant.
- [ ] Library errors typed (`thiserror`, `#[non_exhaustive]`); apps add `.context(..)` at boundaries.
- [ ] Params borrow; no clones that exist only to satisfy the borrow checker; iterators, not index loops.
- [ ] No `as` narrowing or unchecked arithmetic on untrusted values.
- [ ] Async: nothing blocking, no guard across `.await`, cancel-safe `select!`, timeouts, bounded channels, tasks joined or aborted.
- [ ] `unsafe`: justified, minimal, `// SAFETY:` comments, Miri-tested, called out in the report.
- [ ] Deps via `cargo add`, minimal and additive features, `rust-version` respected.
- [ ] New behaviour tested, error paths included; no `#[ignore]` added. Public items documented (`# Errors`/`# Panics`/`# Safety`).

## 11. References
- https://doc.rust-lang.org/book/ · https://doc.rust-lang.org/std/ · https://rust-lang.github.io/api-guidelines/ · https://doc.rust-lang.org/nomicon/
- https://doc.rust-lang.org/edition-guide/rust-2024/index.html · https://github.com/rust-lang/rust/blob/master/RELEASES.md
- https://doc.rust-lang.org/cargo/reference/features.html · https://doc.rust-lang.org/cargo/reference/rust-version.html
- https://doc.rust-lang.org/clippy/ · https://rust-lang.github.io/rust-clippy/stable/index.html
- https://tokio.rs/tokio/tutorial · https://tokio.rs/tokio/topics/shutdown · https://docs.rs/tokio-util/latest/tokio_util/sync/struct.CancellationToken.html
- https://docs.rs/thiserror · https://docs.rs/anyhow · https://proptest-rs.github.io/proptest/ · https://nexte.st/docs/running/
- https://nnethercote.github.io/perf-book/ · https://github.com/rust-lang/miri · https://rustsec.org/ · https://embarkstudios.github.io/cargo-deny/
