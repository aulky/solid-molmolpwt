---
trigger: glob
globs: "**/*.rs,**/Cargo.toml"
description: "Rust quick card: toolchain, invariants, idioms, pitfalls. Loaded when editing .rs files or Cargo.toml."
---
# Rust — quick card
Deep guide: `.agents/guides/languages/rust.md` — read it before non-trivial Rust work (new module, async/concurrency, public API, unsafe, perf).
Principles: `.agents/guides/principles/error-handling.md` · `.agents/guides/principles/concurrency.md` · `.agents/guides/principles/testing-strategy.md`

## Toolchain (use the project's own config first)
- Format: `cargo fmt --all` · Lint: `cargo clippy --all-targets -- -D warnings` (add `--all-features` if the crate has features) · Types: `cargo check --all-targets` · Test: `cargo test` · All: `node .agents/scripts/verify.mjs --only rust`
- Read `Cargo.toml` (`edition`, `rust-version`, `[features]`, `[lints]`) and `rust-toolchain.toml` before using newer syntax or std APIs. Let chains need edition 2024 AND Rust 1.88+.

## Invariants (MUST / NEVER — with reason → alternative)
1. NEVER `unwrap()`/`expect()`/`panic!`/`todo!` on input, I/O or network errors in non-test code — a panic tears down the thread or task and the caller cannot handle it. Instead return `Result` and propagate with `?`. `expect("<why this cannot fail>")` only for true invariants; tests may unwrap.
2. Libraries: typed errors with `thiserror` (enum, `#[from]`/`#[source]`, `#[non_exhaustive]`). Binaries: `anyhow::Result` + `.context("...")`. NEVER return `String` or `Box<dyn Error>` from a public library API — callers cannot match on it.
3. NEVER fix a borrow-checker error by adding `.clone()`, `Rc<RefCell<_>>`, `'static` or `unsafe` — it hides a data-flow problem. Instead shorten the borrow, use `retain`/`entry`/`std::mem::take`, split the struct, or pass ownership.
4. NEVER write `unsafe` unless the task needs FFI or a measured hot path. If unavoidable: smallest block, a `// SAFETY:` comment stating the invariant, a test, and mention it in the report.
5. NEVER block in async code (`std::thread::sleep`, blocking file/network I/O, long CPU loops, a `std::sync::Mutex` guard held across `.await`) — it stalls a runtime worker. Instead `tokio::time::sleep`, `tokio::task::spawn_blocking`, or drop the guard before `.await`.
6. NEVER silence clippy with a crate-wide `#![allow(...)]` — the gate runs `-D warnings`. Instead fix it; for a real false positive put `#[expect(clippy::<lint>, reason = "...")]` on the smallest item.
7. Add dependencies with `cargo add <crate>` (it picks a current, MSRV-compatible version); NEVER hand-edit `Cargo.lock` or invent versions. Features MUST be additive.

## Idioms & pitfalls Flash models get wrong
- Parameters borrow (`&str`, `&[T]`, `&Path`, `impl AsRef<Path>`); return owned (`String`, `Vec<T>`). `&String`/`&Vec<T>` params trigger clippy `ptr_arg`.
- Iterate, do not index: `for x in &v`, `.iter().enumerate()`, `.zip()`, `.windows(2)`. `v[i]` panics when out of bounds; use `.get(i)`.
- `collect::<Result<Vec<_>, _>>()` stops at the first error. Use `let Some(x) = opt else { return ... };` and `ok_or_else`/`map_err` instead of `is_some()` + `unwrap()`.
- `Cow<'_, str>` when a function usually returns its input unchanged. `Arc::clone(&a)` is a cheap refcount; `.clone()` on `String`/`Vec`/`HashMap` copies the whole allocation.
- Generics (`impl Trait`) by default; `Box<dyn Trait>` for heterogeneous collections. Traits with `async fn` or `-> impl Trait` methods cannot be `dyn`.
- `tokio::spawn` needs a `Send + 'static` future: clone the `Arc` before `async move`. Dropping a `JoinHandle` does NOT cancel the task; use `abort()` or a `JoinSet`.
- `select!` drops the losing branch: in loops use cancel-safe calls (`mpsc::Receiver::recv`, not `read_exact`); shut down with `tokio_util::sync::CancellationToken`.
- Integer overflow panics in debug and wraps in release: use `checked_*`/`saturating_*` on untrusted numbers, and `u32::try_from(x)` instead of `x as u32`.
- Edition 2024: `std::env::set_var` is `unsafe`; `extern` blocks are `unsafe extern`; `#[no_mangle]` is `#[unsafe(no_mangle)]`; `gen` is a keyword.
- Tests: unit tests in `#[cfg(test)] mod tests` next to the code, integration tests in `tests/*.rs` (public API only), doc examples run with `cargo test`.

## Example — bad → good
```rust
// BAD: &String param, index loop, unwrap panics on "80,http"
pub fn parse_ports(s: &String) -> Vec<u16> {
    let parts: Vec<&str> = s.split(',').collect();
    let mut out = Vec::new();
    for i in 0..parts.len() {
        out.push(parts[i].trim().parse::<u16>().unwrap());
    }
    out
}
```
```rust
// GOOD: borrowed input, iterator, typed error with the bad value
#[derive(Debug, thiserror::Error)]
#[error("invalid port {input:?}")]
pub struct PortError { input: String, #[source] source: std::num::ParseIntError }

pub fn parse_ports(s: &str) -> Result<Vec<u16>, PortError> {
    s.split(',')
        .map(str::trim)
        .map(|p| p.parse().map_err(|source| PortError { input: p.to_owned(), source }))
        .collect()
}
```

## Before finishing
- [ ] `cargo fmt --all --check` clean · [ ] clippy `-D warnings` clean · [ ] `cargo test` passes, new behaviour has a test
- [ ] no new `unwrap`/`expect`/`todo!`/`dbg!`/`unsafe`/`#[ignore]` outside tests · [ ] `Cargo.lock` changed only via cargo · [ ] MSRV/features respected
