#!/usr/bin/env node
// repeat-run.mjs - run one test command N times to prove it is deterministic (or to measure a flaky
// failure rate). Zero dependencies, Node >= 18, Windows + POSIX.
// Exit: 0 = every run passed, 1 = at least one run failed or timed out, 2 = usage or internal error.
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const USAGE = `Usage: node .agents/skills/write-tests/scripts/repeat-run.mjs [options] -- <command...>

Runs <command> sequentially N times through the platform shell and reports how many runs passed.
Option parsing stops at "--" or at the first argument that is not an option.

Options:
  --times <n>      number of runs (default 10, max 1000)
  --until-fail     stop at the first failing run (bisecting a flaky test)
  --timeout <sec>  per-run timeout, the run counts as failed (default 300)
  --cwd <dir>      working directory (default: current directory)
  --tail <n>       output lines shown for the first failure (default 40)
  --json           print one JSON object instead of text
  --help           show this help

Each run gets the environment variable REPEAT_RUN=<run number> (1-based).
Output: one line per run "PASS|FAIL run <i>/<n> (<secs>s) exit <code>", the tail of the first
failure, then exactly "REPEAT: PASS (<n>/<n>)" or "REPEAT: FAIL (<f>/<runs> failed, first failure: run <i>)".

Examples:
  node .agents/skills/write-tests/scripts/repeat-run.mjs --times 10 -- bunx vitest run src/components/Counter.test.tsx
  node .agents/skills/write-tests/scripts/repeat-run.mjs --times 20 --until-fail -- go test -count=1 -run TestParse ./parser
  node .agents/skills/write-tests/scripts/repeat-run.mjs --times 5 -- "python -m pytest -q tests/test_api.py -p no:cacheprovider"`;

const MAX_BUFFER = 256 * 1024; // keep only the last 256 KB of output per run

function fail(msg) {
  process.stderr.write(`repeat-run: ${msg}\nRun with --help for usage.\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { times: 10, untilFail: false, timeout: 300, cwd: process.cwd(), tail: 40, json: false, command: [] };
  const intArg = (name, value, min, max) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) fail(`${name} needs an integer between ${min} and ${max}, got "${value}"`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { opts.command = argv.slice(i + 1); break; }
    if (!a.startsWith("--")) { opts.command = argv.slice(i); break; }
    const [key, inline] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
    const value = () => (inline !== undefined ? inline : argv[++i] ?? fail(`${key} needs a value`));
    switch (key) {
      case "--help": opts.help = true; break;
      case "--times": opts.times = intArg("--times", value(), 1, 1000); break;
      case "--until-fail": opts.untilFail = true; break;
      case "--timeout": opts.timeout = intArg("--timeout", value(), 1, 86400); break;
      case "--cwd": opts.cwd = resolve(value()); break;
      case "--tail": opts.tail = intArg("--tail", value(), 0, 1000); break;
      case "--json": opts.json = true; break;
      default: fail(`unknown option ${key}`);
    }
  }
  return opts;
}

// One argument = a complete command string (may contain pipes/quotes). Several = join them, quoting
// every part that contains shell metacharacters (cmd.exe on Windows, sh elsewhere).
function quotePart(p) {
  if (p === "") return '""';
  if (process.platform === "win32") {
    return /[\s"&|<>^()%!,;=]/.test(p) ? `"${p.replace(/"/g, '\\"')}"` : p;
  }
  return /[^\w@%+=:,./-]/.test(p) ? `'${p.replace(/'/g, "'\\''")}'` : p;
}

function toCommandLine(parts) {
  if (parts.length === 1) return parts[0];
  const [exe, ...rest] = parts;
  // cmd.exe reads "/" in the program path as a switch (../venv/bin/x fails), so use "\" there.
  const program = process.platform === "win32" ? exe.replace(/\//g, "\\") : exe;
  return [quotePart(program), ...rest.map(quotePart)].join(" ");
}

function killTree(child) {
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    try { child.kill("SIGKILL"); } catch { /* already gone */ }
  }
}

function runOnce(commandLine, opts, run) {
  return new Promise((done) => {
    const started = Date.now();
    let out = "";
    let timedOut = false;
    let child;
    const append = (chunk) => {
      out += chunk.toString();
      if (out.length > MAX_BUFFER) out = out.slice(out.length - MAX_BUFFER);
    };
    try {
      child = spawn(commandLine, {
        shell: true,
        cwd: opts.cwd,
        env: { ...process.env, REPEAT_RUN: String(run) },
        detached: process.platform !== "win32",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      done({ run, exit: null, ms: 0, timedOut: false, output: `spawn failed: ${err.message}` });
      return;
    }
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, opts.timeout * 1000);
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (err) => append(`\nspawn error: ${err.message}\n`));
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ run, exit: timedOut ? null : code, ms: Date.now() - started, timedOut, output: out });
    });
  });
}

function tailLines(text, n) {
  if (n === 0) return "";
  const lines = text.replace(/\r\n/g, "\n").trimEnd().split("\n");
  return lines.slice(-n).map((l) => (l.length > 240 ? `${l.slice(0, 240)}...` : l)).join("\n");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(`${USAGE}\n`); return 0; }
  if (opts.command.length === 0) fail("missing command (put it after --)");
  const commandLine = toCommandLine(opts.command);
  const results = [];
  let firstFailure = null;
  for (let run = 1; run <= opts.times; run++) {
    const r = await runOnce(commandLine, opts, run);
    const ok = r.exit === 0;
    results.push({ run, exit: r.exit, ms: r.ms, timedOut: r.timedOut, status: ok ? "PASS" : "FAIL" });
    if (!ok && !firstFailure) firstFailure = { run, exit: r.exit, timedOut: r.timedOut, tail: tailLines(r.output, opts.tail) };
    if (!opts.json) {
      const why = r.timedOut ? `timeout after ${opts.timeout}s` : `exit ${r.exit}`;
      process.stdout.write(`${ok ? "PASS" : "FAIL"} run ${run}/${opts.times} (${(r.ms / 1000).toFixed(1)}s) ${why}\n`);
    }
    if (!ok && opts.untilFail) break;
  }
  const failed = results.filter((r) => r.status === "FAIL").length;
  const summary = failed === 0
    ? `REPEAT: PASS (${results.length}/${results.length})`
    : `REPEAT: FAIL (${failed}/${results.length} failed, first failure: run ${firstFailure.run})`;
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ command: commandLine, cwd: opts.cwd, runs: results.length, passed: results.length - failed, failed, firstFailure, results, summary }, null, 2)}\n`);
  } else {
    if (firstFailure && firstFailure.tail) {
      process.stdout.write(`--- last ${opts.tail} lines of run ${firstFailure.run} ---\n${firstFailure.tail}\n---\n`);
    }
    process.stdout.write(`${summary}\n`);
  }
  return failed === 0 ? 0 : 1;
}

main().then(
  (code) => { process.exitCode = code; },
  (err) => { process.stderr.write(`repeat-run: internal error: ${err && err.message ? err.message : err}\n`); process.exitCode = 2; },
);
