#!/usr/bin/env node
// Manages skill drafts for /capture-skill. Zero dependencies, Node >= 18, cross-platform.
// Drafts live under .agents/skills/_drafts/<name>/SKILL.md, which the platform never indexes as a skill
// (skills are scanned one level deep under .agents/skills/), so a draft is inert until promoted.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "../../../scripts/lib/frontmatter.mjs";
import { runDoctor } from "../../../scripts/doctor.mjs";

const USAGE = `Usage: node .agents/skills/capture-skill/scripts/skill-draft.mjs <command> [args]

Commands:
  new <name> [--title "<Title>"] [--force]
      Scaffold .agents/skills/_drafts/<name>/SKILL.md from references/skill-template.md.
      Fills in name/date/title; leaves description, icon and every TODO for you to write.
  list [--json]
      List drafts under _drafts/ with a readiness status (READY | NEEDS REVIEW | NOT READY | BROKEN).
  check <name>
      Run the promotion gates against one draft and print PASS/FAIL, without changing anything.
  promote <name> [--confirm] [--force] [--json]
      Move .agents/skills/_drafts/<name>/ to .agents/skills/<name>/, strip the two draft-safety
      frontmatter keys and the DRAFT comment, mark Provenance as promoted, then run the kit doctor.
      Without --confirm this is a dry run: it prints the gate report and changes nothing.
      Hard gates always block (missing SKILL.md, bad frontmatter, name/folder mismatch, > 250 lines,
      target already exists). Soft gates (leftover TODOs, missing icon, missing sections) block only
      without --force.

All commands take --root <dir> (default: four levels above this script, i.e. the repo root).
Exit codes: 0 success (also for a passing dry run), 1 gate/doctor failure, 2 usage or internal error.`;

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BUILTIN_COMMANDS = new Set(["plan", "learn", "rewind", "fork", "browser", "model", "agents", "skills", "hooks", "help", "config", "usage", "permissions", "effort"]);
const REQUIRED_SECTIONS = ["## When to use", "## Checklist", "## Procedure", "## Output", "## References", "## Provenance"];
const LINE_CAP = 250;
const DESC_CAP = 300;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..", "..");
let ROOT = DEFAULT_ROOT;
let SKILLS_DIR = path.join(ROOT, ".agents", "skills");
let DRAFTS_DIR = path.join(SKILLS_DIR, "_drafts");
let TEMPLATE_PATH = path.join(SKILLS_DIR, "capture-skill", "references", "skill-template.md");

function setRoot(root) {
  ROOT = root;
  SKILLS_DIR = path.join(ROOT, ".agents", "skills");
  DRAFTS_DIR = path.join(SKILLS_DIR, "_drafts");
  TEMPLATE_PATH = path.join(SKILLS_DIR, "capture-skill", "references", "skill-template.md");
}

const toPosix = (p) => p.split(path.sep).join("/");
const rel = (p) => toPosix(path.relative(ROOT, p));
const todayISO = () => new Date().toISOString().slice(0, 10);
const lineCount = (s) => (s ? (s.match(/\n/g) ?? []).length + (s.endsWith("\n") ? 0 : 1) : 0);
const titleCase = (name) => name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

function parseArgs(argv) {
  const o = { _: [], confirm: false, force: false, json: false, title: null, root: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`missing value for ${a}`);
      return argv[++i];
    };
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--confirm") o.confirm = true;
    else if (a === "--force" || a === "-f") o.force = true;
    else if (a === "--json") o.json = true;
    else if (a === "--title") o.title = next();
    else if (a === "--root") o.root = next();
    else if (a.startsWith("--")) throw new Error(`unknown flag: ${a}`);
    else o._.push(a);
  }
  return o;
}

/** Read and validate a draft folder. Never throws; returns hard/soft findings plus the parsed data. */
function validateDraft(name, dir) {
  const hard = [];
  const soft = [];
  const file = path.join(dir, "SKILL.md");
  if (!fs.existsSync(dir)) { hard.push(`no such draft: ${rel(dir)}`); return { hard, soft, exists: false, fmData: {} }; }
  if (!fs.existsSync(file)) { hard.push(`${rel(dir)} has no SKILL.md`); return { hard, soft, exists: false, fmData: {} }; }
  const text = fs.readFileSync(file, "utf8");
  const fm = parseFrontmatter(text);
  if (!fm.hasFrontmatter) hard.push("SKILL.md has no frontmatter (name, description)");
  for (const e of fm.errors) hard.push(`frontmatter: ${e.message}`);
  for (const d of fm.duplicates) hard.push(`frontmatter: duplicate key "${d.key}"`);
  const fmName = fm.data && fm.data.name;
  if (typeof fmName !== "string" || !fmName.trim()) hard.push('frontmatter "name" is missing (must equal the folder name)');
  else {
    if (fmName !== name) hard.push(`frontmatter name "${fmName}" does not match folder "${name}"`);
    if (!NAME_RE.test(fmName)) hard.push(`name "${fmName}" must be lowercase-hyphen (a-z, 0-9, -)`);
    if (BUILTIN_COMMANDS.has(fmName)) hard.push(`"/${fmName}" shadows a built-in slash command; rename the skill`);
  }
  const desc = fm.data && fm.data.description;
  if (typeof desc !== "string" || !desc.trim()) hard.push('frontmatter "description" is missing');
  else {
    if (desc.length > DESC_CAP) hard.push(`description is ${desc.length} chars (> ${DESC_CAP})`);
    if (/TODO/.test(desc)) soft.push("description still contains a TODO placeholder");
  }
  const icon = fm.data && fm.data.metadata && fm.data.metadata.icon;
  if (!icon || !String(icon).trim() || /todo/i.test(String(icon)) || String(icon) === "❓") {
    soft.push("metadata.icon is missing or the placeholder icon (choose one real emoji)");
  }
  const lines = lineCount(text);
  if (lines > LINE_CAP) hard.push(`${lines} lines > ${LINE_CAP} (kit skill cap; move bulk into references/)`);
  const todoCount = (text.match(/TODO/g) ?? []).length;
  if (todoCount) soft.push(`${todoCount} TODO marker(s) left in the body`);
  for (const h of REQUIRED_SECTIONS) if (!text.includes(h)) soft.push(`missing section "${h}"`);
  return { hard, soft, exists: true, text, fmData: fm.data || {}, lines, todoCount };
}

function gateReportLines(name, v) {
  const out = [`DRAFT: ${name}`];
  if (!v.exists) { for (const h of v.hard) out.push(`  FAIL  ${h}`); return out; }
  out.push(v.hard.length ? `  ${v.hard.length} hard failure(s) (always block promotion):` : "  hard gates: ok");
  for (const h of v.hard) out.push(`    FAIL  ${h}`);
  out.push(v.soft.length ? `  ${v.soft.length} soft issue(s) (block unless --force):` : "  soft gates: ok");
  for (const s of v.soft) out.push(`    WARN  ${s}`);
  return out;
}

function cmdNew(o) {
  const name = o._[0];
  if (!name) throw new Error("new requires a <name>");
  if (!NAME_RE.test(name)) throw new Error(`name "${name}" must be lowercase-hyphen (a-z, 0-9, -)`);
  if (BUILTIN_COMMANDS.has(name)) throw new Error(`"/${name}" shadows a built-in slash command; choose another name`);
  if (fs.existsSync(path.join(SKILLS_DIR, name))) throw new Error(`a real skill already uses this name: .agents/skills/${name}/`);
  const dir = path.join(DRAFTS_DIR, name);
  if (fs.existsSync(dir) && !o.force) throw new Error(`draft already exists: ${rel(dir)} (use --force to overwrite)`);
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const body = template
    .replaceAll("{{name}}", name)
    .replaceAll("{{date}}", todayISO())
    .replaceAll("{{title}}", o.title || titleCase(name))
    .replaceAll("{{icon}}", "❓")
    .replaceAll("{{description}}", "TODO one sentence, third person: what it does, when to use it, trigger words (<= 300 chars)");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), body, "utf8");
  const bytes = Buffer.byteLength(body, "utf8");
  process.stdout.write([
    `Created ${rel(path.join(dir, "SKILL.md"))} (${bytes} B)`,
    "Inert: this folder is under _drafts/, one level too deep for the platform to load as a skill.",
    "Next: fill every TODO (description, icon, steps, output template, Provenance/Evidence), then",
    `  node .agents/skills/capture-skill/scripts/skill-draft.mjs check ${name}`,
    `  node .agents/skills/capture-skill/scripts/skill-draft.mjs promote ${name} --confirm`,
  ].join("\n") + "\n");
  return 0;
}

function cmdList(o) {
  if (!fs.existsSync(DRAFTS_DIR)) {
    if (o.json) process.stdout.write("[]\n");
    else process.stdout.write("No drafts: .agents/skills/_drafts/ does not exist yet. Create one with \"new <name>\".\n");
    return 0;
  }
  const names = fs.readdirSync(DRAFTS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const rows = names.map((name) => {
    const v = validateDraft(name, path.join(DRAFTS_DIR, name));
    const status = !v.exists ? "BROKEN" : v.hard.length ? "NOT READY" : v.soft.length ? "NEEDS REVIEW" : "READY";
    const desc = typeof v.fmData.description === "string" ? v.fmData.description.slice(0, 70) : "(no description)";
    return { name, status, hard: v.hard.length, soft: v.soft.length, description: desc };
  });
  if (o.json) { process.stdout.write(JSON.stringify(rows, null, 2) + "\n"); return 0; }
  if (!rows.length) { process.stdout.write("No drafts under .agents/skills/_drafts/.\n"); return 0; }
  for (const r of rows) process.stdout.write(`${r.status.padEnd(12)} ${r.name.padEnd(24)} hard=${r.hard} soft=${r.soft}  ${r.description}\n`);
  return 0;
}

function cmdCheck(o) {
  const name = o._[0];
  if (!name) throw new Error("check requires a <name>");
  const v = validateDraft(name, path.join(DRAFTS_DIR, name));
  for (const l of gateReportLines(name, v)) process.stdout.write(l + "\n");
  const verdict = v.hard.length ? "FAIL" : v.soft.length ? "PASS (with soft issues)" : "PASS";
  process.stdout.write(`CHECK: ${verdict}\n`);
  return v.hard.length ? 1 : 0;
}

/** Strip the two draft-safety frontmatter keys and the DRAFT comment; mark Provenance promoted. */
function stripDraftMarkers(text) {
  let t = text;
  t = t.replace(/^disable-slash-command:\s*true\r?\n/m, "");
  t = t.replace(/^disable-model-invocation:\s*true\r?\n/m, "");
  t = t.replace(/<!-- DRAFT \(inert\):[\s\S]*?-->\n\n?/, "\n");
  t = t.replace(/^- Status: draft\s*$/m, `- Status: promoted ${todayISO()} by /capture-skill promote`);
  return t;
}

function cmdPromote(o) {
  const name = o._[0];
  if (!name) throw new Error("promote requires a <name>");
  const src = path.join(DRAFTS_DIR, name);
  const dest = path.join(SKILLS_DIR, name);
  const v = validateDraft(name, src);
  for (const l of gateReportLines(name, v)) process.stdout.write(l + "\n");
  if (v.hard.length) { process.stdout.write(`PROMOTE: BLOCKED (${v.hard.length} hard failure(s) - fix them, hard gates ignore --force)\n`); return 1; }
  const destExists = fs.existsSync(dest);
  const wouldBlock = (v.soft.length && !o.force) || (destExists && !o.force);
  if (!o.confirm) {
    // Dry run: nothing on disk changes either way, so report the preview and exit 0.
    if (v.soft.length && !o.force) process.stdout.write(`Dry run: would be BLOCKED by ${v.soft.length} soft issue(s) above (fix them, or re-run with --force).\n`);
    else if (destExists && !o.force) process.stdout.write(`Dry run: would be BLOCKED - ${rel(dest)}/ already exists (use --force to overwrite).\n`);
    else process.stdout.write(`Dry run: would move ${rel(src)}/ -> ${rel(dest)}/ and run the kit doctor.\n`);
    process.stdout.write(wouldBlock ? "Re-run with --confirm --force once fixed (or forced) to promote.\n" : "Re-run with --confirm to promote.\n");
    return 0;
  }
  if (v.soft.length && !o.force) { process.stdout.write(`PROMOTE: BLOCKED (${v.soft.length} soft issue(s) - fix them, or re-run with --force)\n`); return 1; }
  if (destExists && !o.force) { process.stdout.write(`PROMOTE: BLOCKED (${rel(dest)}/ already exists - use --force to overwrite)\n`); return 1; }
  if (destExists) fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  const skillMdPath = path.join(dest, "SKILL.md");
  fs.writeFileSync(skillMdPath, stripDraftMarkers(fs.readFileSync(skillMdPath, "utf8")), "utf8");
  fs.rmSync(src, { recursive: true, force: true });
  process.stdout.write(`Moved ${rel(src)}/ -> ${rel(dest)}/\n`);
  let res;
  try {
    res = runDoctor({ root: ROOT });
  } catch (e) {
    process.stdout.write(`doctor: internal error: ${e && e.message ? e.message : String(e)}\n`);
    process.stdout.write("PROMOTE: DONE (doctor could not run - run it by hand: node .agents/scripts/doctor.mjs)\n");
    return 1;
  }
  const prefix = `.agents/skills/${name}/`;
  const mine = res.issues.filter((i) => i.file && i.file.startsWith(prefix));
  const mineErrors = mine.filter((i) => i.level === "error");
  const mineWarnings = mine.filter((i) => i.level !== "error");
  if (o.json) process.stdout.write(JSON.stringify({ name, moved: true, dest: rel(dest), doctor: { ok: res.ok, issues: mine } }, null, 2) + "\n");
  else {
    for (const i of mine) process.stdout.write(`  ${i.level.toUpperCase().padEnd(5)} ${i.code}  ${i.message}\n`);
    if (!mine.length) process.stdout.write("  doctor: no issues for this skill\n");
  }
  process.stdout.write(mineErrors.length
    ? `PROMOTE: DONE, but doctor found ${mineErrors.length} error(s) above - fix them next\n`
    : mineWarnings.length
      ? `PROMOTE: DONE, but doctor found ${mineWarnings.length} warning(s) above - review them\n`
      : "PROMOTE: DONE (doctor clean for this skill)\n");
  return mineErrors.length ? 1 : 0;
}

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === "--help" || argv[0] === "-h") { process.stdout.write(USAGE + "\n"); return 0; }
  const [cmd, ...rest] = argv;
  const o = parseArgs(rest);
  if (o.help) { process.stdout.write(USAGE + "\n"); return 0; }
  if (o.root) {
    const abs = path.resolve(o.root);
    if (!fs.existsSync(abs)) throw new Error(`--root not found: ${abs}`);
    setRoot(abs);
  }
  if (cmd === "new") return cmdNew(o);
  if (cmd === "list") return cmdList(o);
  if (cmd === "check") return cmdCheck(o);
  if (cmd === "promote") return cmdPromote(o);
  throw new Error(`unknown command: ${cmd}`);
}

try {
  process.exitCode = main();
} catch (e) {
  process.stderr.write(`error: ${e && e.message ? e.message : String(e)}\n`);
  process.exitCode = 2;
}
