// PreToolUse run_command — SHIPPED DISABLED (hooks.json "frontier-guard": { "enabled": false }).
// deny: catastrophic, irreversible commands. force_ask: risky / hard-to-reverse commands (always prompts, ignores
// cached grants). Everything else: guard.config.json "defaultDecision" (default "ask").
// ALWAYS returns an explicit decision: `{}` would DENY the tool (VERIFIED). Internal error -> {"decision":"ask"}.
import path from "node:path";
import { runHook, readJson, unwrapArg, isEntry, HOOKS_DIR, debug } from "./lib.mjs";

const DECISIONS = new Set(["ask", "allow", "force_ask", "deny", "deny_unless_prior_grant"]);
const FALLBACK = { decision: "ask" };

export function loadConfig(file = path.join(HOOKS_DIR, "guard.config.json")) {
  const j = readJson(file) || {};
  const compile = (list) => (Array.isArray(list) ? list : []).flatMap((r) => {
    try {
      const pattern = typeof r === "string" ? r : r && r.pattern;
      if (typeof pattern !== "string" || !pattern) return [];
      return [{ re: new RegExp(pattern, "i"), label: (r && r.reason) || pattern }];
    } catch { return []; }
  });
  return {
    defaultDecision: DECISIONS.has(j.defaultDecision) ? j.defaultDecision : "ask",
    extraDeny: compile(j.extraDeny),
    extraForceAsk: compile(j.extraForceAsk),
  };
}

// ---------------------------------------------------------------- command parsing
const WRAPPER = [
  /^(?:sudo|doas|nohup|time|exec|command|builtin|call|env)\s+/i,
  /^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/,
  /^cmd(?:\.exe)?\s+\/[a-z]\s+/i,
  /^(?:powershell|pwsh)(?:\.exe)?\s+(?:-\w+\s+)*/i,
  /^(?:ba|z|da)?sh\s+-c\s+/i,
  /^&\s*/,
];
function segments(flat) {
  return flat.split(/\s*(?:&&|\|\||;|\||&(?!>)|\r?\n)\s*/).map((seg) => {
    let s = seg.trim();
    for (let i = 0; i < 6; i++) {
      const before = s;
      for (const re of WRAPPER) s = s.replace(re, "");
      if (s === before) break;
    }
    const tokens = s.split(/\s+/).filter(Boolean);
    const cmd = (tokens[0] || "").replace(/\\/g, "/").split("/").pop().replace(/\.(exe|com|cmd|bat)$/i, "").toLowerCase();
    return { text: s, tokens, cmd };
  }).filter((x) => x.cmd);
}

const ROOT_OR_HOME = [
  /^\/+\*?$/, /^[a-z]:\/*\*?$/i, /^\/[a-z]\/?\*?$/i, /^~\/?\*?$/,
  /^(?:\$home|\$\{home\}|\$env:userprofile|\$env:homepath|\$env:systemdrive|%userprofile%|%homepath%|%systemdrive%)\/?\*?$/i,
  /^\/(?:home|users)\/[^/]+\/?\*?$/i, /^[a-z]:\/users\/[^/]+\/?\*?$/i,
  /^\/(?:bin|boot|dev|etc|lib|lib64|opt|proc|root|sbin|srv|sys|usr|var)\/?\*?$/i, /^[a-z]:\/windows(?:\/system32)?\/?\*?$/i,
];
const isRootOrHome = (t) => ROOT_OR_HOME.some((re) => re.test(t.replace(/\\/g, "/")));
const isDriveRoot = (p) => typeof p === "string" && (/^[a-z]:[\\/]*$/i.test(p.trim()) || /^\/+$/.test(p.trim()));
// A well-formed absolute path of ANY depth (not just a root) — used to tell "cwd is a known, ordinary
// subdirectory" apart from "cwd is missing/blank/relative/garbage", which we must not treat as safe.
const isAbsoluteCwd = (p) => typeof p === "string" && /^(?:[a-z]:[\\/]|\\\\|\/)/i.test(p.trim());

function rmCatastrophic(seg, cwd) {
  const del = ["rm", "remove-item", "ri", "del", "erase", "rmdir", "rd"];
  if (!del.includes(seg.cmd)) return null;
  const cmdStyle = ["del", "erase", "rmdir", "rd"].includes(seg.cmd);
  const args = seg.tokens.slice(1);
  const isFlag = (t) => t.startsWith("-") || (cmdStyle && /^\/[a-z]$/i.test(t));
  const flags = args.filter(isFlag).map((t) => t.toLowerCase());
  const targets = args.filter((t) => !isFlag(t));
  if (flags.includes("--no-preserve-root")) return "rm --no-preserve-root";
  const recursive = flags.some((f) => f === "--recursive" || f === "/s" || /^-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?$/.test(f) || (/^-[a-z]+$/.test(f) && f.includes("r") && !/^-(?:credential|filter|exclude|include)/.test(f)));
  if (!recursive) return null;
  if (targets.some(isRootOrHome)) return "recursive delete of a drive root, system directory or home directory";
  const bareWildcard = targets.some((t) => /^(?:\.\/)?\*$/.test(t));
  if (bareWildcard) {
    if (isDriveRoot(cwd)) return "recursive delete of * at a drive root";
    // Cwd is missing, blank, or does not even parse as an absolute path: we cannot rule out a drive root
    // or home directory, so this must NEVER fall through to defaultDecision (which can be "allow"). Ask.
    if (!isAbsoluteCwd(cwd)) return { ask: "recursive delete of * with an unresolvable working directory (cannot confirm it is not a drive root or home directory)" };
  }
  return null;
}

function gitForcePushMain(seg) {
  if (seg.cmd !== "git" || !seg.tokens.includes("push")) return null;
  const t = seg.tokens.slice(1);
  const force = t.some((x) => /^(?:--force|-f|--force-with-lease(?:=.*)?|--force-if-includes)$/i.test(x) || /^-[a-z]*f[a-z]*$/.test(x) || /^\+/.test(x));
  const main = t.some((x) => /^\+?(?:[^:\s]*:)?(?:refs\/heads\/)?(?:main|master)$/i.test(x));
  return force && main ? "force push to main/master" : null;
}

const DENY_SEG = [
  rmCatastrophic,
  (s) => (s.cmd === "format" && s.tokens.slice(1).some((t) => /^[a-z]:\\?$|^\/fs:/i.test(t)) ? "format a disk" : null),
  (s) => (["format-volume", "clear-disk"].includes(s.cmd) ? "format a disk" : null),
  (s) => (/^(?:mkfs(?:\.\w+)?|mke2fs|wipefs)$/.test(s.cmd) ? "mkfs (format a filesystem)" : null),
  (s) => (s.cmd === "dd" && s.tokens.some((t) => /^of=\/dev\/(?!null$|zero$|stdout$|stderr$)/i.test(t)) ? "dd onto a device" : null),
  (s) => (["shutdown", "reboot", "halt", "poweroff", "stop-computer", "restart-computer"].includes(s.cmd) ? "shutdown/reboot" : null),
  (s) => (s.cmd === "systemctl" && /^(?:poweroff|reboot|halt|kexec)$/i.test(s.tokens[1] || "") ? "shutdown/reboot" : null),
  (s) => (s.cmd === "init" && /^[06]$/.test(s.tokens[1] || "") ? "shutdown/reboot" : null),
  gitForcePushMain,
  (s) => (s.cmd === "dropdb" || (s.cmd === "mysqladmin" && s.tokens.some((t) => /^drop$/i.test(t))) ? "DROP DATABASE" : null),
];
const DENY_FLAT = [
  [/:\(\)\{/, "fork bomb", (f) => f.replace(/\s+/g, "")],
  [/%0\|%0/, "fork bomb", (f) => f.replace(/\s+/g, "")],
  [/\bdrop\s+database\b/i, "DROP DATABASE"],
  [/\b(?:curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z|da|k|fi)?sh\b/i, "remote script piped to a shell"],
  [/\b(?:curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b[^|]*\|\s*(?:iex|invoke-expression|pwsh|powershell|python\d*|node|perl|ruby)\b/i, "remote script piped to an interpreter"],
  [/\b(?:iex|invoke-expression)\b.*\b(?:iwr|irm|invoke-webrequest|invoke-restmethod|downloadstring|curl|wget)\b/i, "remote script piped to an interpreter"],
  [/\b(?:ba|z)?sh\b[^|;&]*(?:<\(|\$\()\s*(?:curl|wget)\b/i, "remote script piped to a shell"],
];
const FORCE_ASK = [
  [/\bgit\s+(?:-[cC]\s+\S+\s+)*push\b/i, "git push"],
  [/\bgit\s+reset\b.*--hard\b/i, "git reset --hard"],
  [/\bgit\s+clean\b.*(?:\s-[a-z]*f|--force)/i, "git clean -f"],
  [/\bgit\s+rebase\b/i, "git rebase"],
  [/\bgit\s+commit\b.*--amend\b/i, "git commit --amend"],
  [/\bgit\s+(?:checkout|restore)\s+(?:--\s+)?\.(?:\s|$)/i, "discard all working-tree changes"],
  [/\bgit\s+stash\s+(?:drop|clear)\b/i, "git stash drop/clear"],
  [/\bgit\s+branch\s+(?:.*\s)?-D\b/, "git branch -D"],
  [/\bgit\s+filter-(?:branch|repo)\b/i, "git history rewrite"],
  [/\b(?:npm|pnpm|yarn|bun)\s+publish\b/i, "package publish"],
  [/\bcargo\s+publish\b/i, "cargo publish"],
  [/\bgem\s+push\b|\btwine\s+upload\b|\b(?:poetry|uv)\s+publish\b|\bdotnet\s+nuget\s+push\b|\bmvn\s+deploy\b/i, "package publish"],
  [/\b(?:terraform|tofu)\s+(?:apply|destroy)\b/i, "terraform apply/destroy"],
  [/\bpulumi\s+(?:up|destroy)\b|\bcdk\s+(?:deploy|destroy)\b/i, "infrastructure change"],
  [/\bkubectl\s+(?:delete|apply|replace|drain)\b/i, "kubectl delete/apply"],
  [/\bhelm\s+(?:upgrade|uninstall|delete|rollback)\b/i, "helm upgrade/uninstall"],
  [/\bdocker\s+(?:system|volume|image|container|builder|network)\s+prune\b/i, "docker prune"],
  [/\bdocker(?:-compose|\s+compose)\b.*\bdown\b.*(?:\s-v\b|--volumes)/i, "docker compose down --volumes"],
  [/\bdrop\s+(?:table|schema)\b/i, "DROP TABLE/SCHEMA"],
  [/\btruncate\s+(?:table\s+)?[\w.\[]/i, "TRUNCATE"],
  [/(?:^|[\s:])deploy(?::\S*)?(?=\s|$)|\bdeploy[\w-]*\.(?:sh|ps1|bat|cmd)\b/i, "deploy command"],
  [/\bvercel\b.*--prod\b|\brailway\s+up\b/i, "deploy command"],
  [/\bdiskpart\b/i, "diskpart"],
];

export function evaluate(cmdLine, cwd, config = loadConfig()) {
  const raw = String(cmdLine ?? "");
  const flat = raw.replace(/["'`]/g, " ").replace(/[ \t]+/g, " ").trim();
  if (!flat) return { decision: "ask", reason: "command-guard: empty command." };
  const segs = segments(flat);
  const deny = (label) => ({
    decision: "deny",
    reason: `command-guard: blocked (${label}). This is irreversible. Do not retry or work around it; tell the user what you wanted to do and let them run it themselves if intended.`,
  });
  const ask = (label) => ({ decision: "force_ask", reason: `command-guard: ${label} is risky or hard to reverse; the user must confirm.` });
  for (const r of config.extraDeny) if (r.re.test(raw) || r.re.test(flat)) return deny(r.label);
  for (const seg of segs) {
    for (const rule of DENY_SEG) {
      const result = rule(seg, cwd);
      if (!result) continue;
      if (typeof result === "string") return deny(result);
      if (result.ask) return ask(result.ask); // under-specified input for a catastrophic-shaped rule: never allow/ask-default
    }
  }
  for (const [re, label, prep] of DENY_FLAT) if (re.test(prep ? prep(flat) : flat)) return deny(label);
  for (const r of config.extraForceAsk) if (r.re.test(raw) || r.re.test(flat)) return ask(r.label);
  for (const [re, label] of FORCE_ASK) if (re.test(flat)) return ask(label);
  return { decision: config.defaultDecision, reason: `command-guard: no rule matched (default: ${config.defaultDecision}).` };
}

async function main(payload, ctx) {
  if (!payload) return FALLBACK;
  const tc = payload.toolCall && typeof payload.toolCall === "object" ? payload.toolCall : {};
  if (tc.name && tc.name !== "run_command") return { decision: "ask", reason: "command-guard: not a run_command call." };
  let a = tc.args;
  if (typeof a === "string") { try { a = JSON.parse(a); } catch { a = {}; } }
  a = a && typeof a === "object" ? a : {};
  const out = evaluate(unwrapArg(a.CommandLine), unwrapArg(a.Cwd));
  debug(ctx, { hook: "guard", decision: out.decision });
  return DECISIONS.has(out.decision) ? out : FALLBACK;
}

if (isEntry(import.meta.url)) runHook({ name: "command-guard", fallback: FALLBACK, budgetMs: 4000, main });
