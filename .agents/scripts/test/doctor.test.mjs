// node --test .agents/scripts/test/doctor.test.mjs  -- doctor.mjs + lib/frontmatter.mjs on fixture kits in temp dirs.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, parseYaml, splitFrontmatter } from '../lib/frontmatter.mjs';
import { runDoctor, formatText, checkGlobPattern, extractKitRefs, extractLinks, THIRD_PARTY_SKILLS, parseTypePhase, parseTypePhaseMap, matcherMatches, guardedTools, GUARD_TOOLS } from '../doctor.mjs';
import { WORKER_TYPES } from '../../hooks/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DOCTOR = path.resolve(HERE, '..', 'doctor.mjs');
const TMP_BASE = process.env.FRONTIER_KIT_TMP || os.tmpdir();
fs.mkdirSync(TMP_BASE, { recursive: true });
const TMP = fs.mkdtempSync(path.join(TMP_BASE, 'doctor-test-'));
after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

let seq = 0;
function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}
const rule = (fm, body = '# Rule\nDo the thing.\n') => `---\n${fm}\n---\n${body}`;

const GUARD_MATCHER = 'write_to_file|replace_file_content|multi_replace_file_content|invoke_subagent';
const toolList = (tools) => (tools ? `tools:\n${tools.map((t) => `  - ${t}\n`).join('')}` : '');
const ORCH_AGENT = (tools = ['view_file', 'run_command', 'invoke_subagent', 'send_message']) => `---\nname: orchestrator\ndescription: "Core agent: dispatches one task per worker."\nmodel: inherit\nsubagent: false\nmainAgent: true\n${toolList(tools)}---\n# Role\nYou are the ORCHESTRATOR. Workers report with send_message.\n`;
const WORKER = (name, { tools = ['view_file', 'run_command'], role = true } = {}) => `---\nname: ${name}\ndescription: "Worker."\nsubagent: true\nmainAgent: false\n${toolList(tools)}---\n# Role\n${role ? 'You are a WORKER (EXPLORE phase). ' : ''}One task.\n# Rules\nReport with send_message.\n`;

/** A small, fully valid kit. Returns its root. */
function goodKit(mutate) {
  const root = path.join(TMP, `kit-${++seq}`);
  const w = (rel, c) => write(root, rel, c);
  w('AGENTS.md', '# Project facts\n- Stack: SolidStart. Verify: `node .agents/scripts/verify.mjs`\n');
  w('.agents/GEMINI.md', '# Kit index\n- Guides: `.agents/guides/README.md`\n- Bug -> /verify\n');
  w('.agents/scripts/verify.mjs', '// stub\n');
  w('.agents/rules/00-core-protocol.md', rule('trigger: always_on\ndescription: "Core protocol: explore, plan, implement, verify, report."',
    '# Core\nRead `.agents/guides/principles/simplicity.md` before refactors.\n@[shared](./shared-snippet.txt)\n'));
  w('.agents/rules/shared-snippet.txt', 'Included text.\n');
  w('.agents/rules/90-lessons.md', rule('trigger: always_on\ndescription: "Curated lessons."', '# Lessons\n## Platform\n- invoke_subagent is async; wait for the message. (L-0001)\n'));
  w('.agents/rules/lang-typescript.md', rule('trigger: glob\nglobs: "**/*.ts,**/*.tsx,**/*.mts,**/*.cts"\ndescription: "TypeScript quick card. Loaded when editing ts files."',
    '# TypeScript\nDeep guide: `.agents/guides/languages/typescript.md`\n'));
  w('.agents/rules/fw-solidjs.md', rule('trigger: model_decision\nglobs: "**/*.tsx,**/*.jsx"\ndescription: "SolidJS pack: signals, stores, control flow."',
    '# SolidJS\nApplies only if package.json depends on solid-js. Otherwise ignore this rule.\n'));
  w('.agents/rules/topic-security-sensitive.md', rule("trigger: glob\nglobs: '**/*auth*,**/*session*,**/.env*,**/Dockerfile'\ndescription: \"Security-sensitive files.\""));
  w('.agents/rules/topic-architecture-decisions.md', rule('trigger: model_decision\ndescription: "Creating or editing ADRs in docs/adr."', '# ADR\nSee [the guide](../guides/principles/simplicity.md).\n'));
  w('.agents/guides/README.md', '# Guides\n- [Simplicity](principles/simplicity.md)\n- [TypeScript](languages/typescript.md)\n');
  w('.agents/guides/principles/simplicity.md', '# Simplicity\nKISS.\n');
  w('.agents/guides/languages/typescript.md', '# TypeScript guide\n');
  w('.agents/skills/verify/SKILL.md', '---\nname: verify\ndescription: >-\n  Runs the polyglot verification script and fixes failures. Use when asked to\n  verify, test, or check the project.\nmetadata:\n  icon: "✅"\n---\n# Verify\nSee [steps](references/steps.md) and `.agents/scripts/verify.mjs`.\n');
  w('.agents/skills/verify/references/steps.md', '# Steps\nBack to [skill](../SKILL.md).\n');
  w('.agents/skills/vercel-react-best-practices/SKILL.md', '---\nname: vercel-react-best-practices\ndescription: React performance guidelines.\n---\n# Vercel\n');
  w('.agents/skills/vercel-react-best-practices/AGENTS.md', '# third-party compiled rules\n');
  w('.agents/agents/explorer.md', '---\nname: explorer\ndescription: "Fast read-only codebase search; returns path:line facts."\nmodel: flash\ntools:\n  - view_file\n  - grep_search\n  - find_by_name\n  - list_dir\n  - run_command\nsubagent: true\nmainAgent: false\ncommandExecutionPolicy: sandbox\n---\n# Role\nYou are a WORKER (EXPLORE phase). Search.\n# Output format\nFacts.\n# Rules\nNever modify files. Send your final result with send_message to the caller.\n');
  w('.agents/hooks.json', JSON.stringify({
    'frontier-track': { PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'node hooks/track-tools.mjs', timeout: 15 }] }] },
    'frontier-context': { PreInvocation: [{ type: 'command', command: 'node hooks/inject-context.mjs', timeout: 10 }] },
    'frontier-gate': { Stop: [{ type: 'command', command: 'node hooks/quality-gate.mjs', timeout: 20 }] },
    'frontier-guard': { enabled: false, PreToolUse: [{ matcher: 'run_command', hooks: [{ type: 'command', command: 'node hooks/command-guard.mjs', timeout: 5 }] }] },
    'frontier-orchestrator-guard': { PreToolUse: [{ matcher: GUARD_MATCHER, hooks: [{ type: 'command', command: 'node hooks/orchestrator-guard.mjs', timeout: 5 }] }] },
  }, null, 2));
  w('.agents/agents/orchestrator.md', ORCH_AGENT());
  w('.agents/hooks/lib.mjs', 'export const x = 1;\nconst TYPE_PHASE = {\n  explorer: "EXPLORE",\n};\n');
  for (const h of ['track-tools', 'inject-context', 'quality-gate', 'command-guard', 'orchestrator-guard']) w(`.agents/hooks/${h}.mjs`, 'process.stdout.write("{}");\n');
  w('.agents/hooks/guard.config.json', '{ "defaultDecision": "ask" }\n');
  w('.agents/memory/lessons.md', '# Lessons ledger\n\n## Active\n\n- [L-0001] scope:platform | +2 -0 | 2026-09-24 | invoke_subagent is async; wait because the parent answered null | evidence: probe run 5\n\n## Retired\n');
  w('node_modules/pkg/AGENTS.md', '# ignored\n');
  w('.scratch/probe/AGENTS.md', '# ignored\n');
  w('src/app.tsx', 'export default 1;\n');
  if (mutate) mutate(w, root);
  return root;
}

const codes = (res, level) => res.issues.filter((i) => !level || i.level === level).map((i) => i.code);
function expectIssue(res, level, code, fileSub) {
  const hit = res.issues.find((i) => i.level === level && i.code === code && (!fileSub || i.file.includes(fileSub)));
  assert.ok(hit, `expected ${level} ${code}${fileSub ? ` in ${fileSub}` : ''}; got:\n${formatText(res, { quiet: true })}`);
  return hit;
}

// ---------------------------------------------------------------------------------------------
describe('lib/frontmatter', () => {
  test('scalars, quotes, comments, CRLF and BOM', () => {
    const r = parseFrontmatter('﻿---\r\ntrigger: glob # c\r\nglobs: "**/*.ts,**/*.tsx"\r\nq: \'it\'\'s\'\r\nn: 42\r\nf: 1.5\r\nb: true\r\nz: ~\r\nurl: https://x.dev/a:b\r\n---\r\nbody\r\n');
    assert.equal(r.hasFrontmatter, true);
    assert.deepEqual(r.data, { trigger: 'glob', globs: '**/*.ts,**/*.tsx', q: "it's", n: 42, f: 1.5, b: true, z: null, url: 'https://x.dev/a:b' });
    assert.equal(r.styles.globs.style, 'double');
    assert.equal(r.styles.globs.line, 3);
    assert.equal(r.styles.q.style, 'single');
    assert.equal(r.styles.trigger.style, 'plain');
    assert.equal(r.body.trim(), 'body');
    assert.deepEqual(r.errors, []);
  });
  test('folded >- and literal | blocks', () => {
    const r = parseFrontmatter('---\nd: >-\n  one\n  two\n\n  three\nl: |\n  a\n    b\n  # kept\nk: >\n  x\n---\n');
    assert.equal(r.data.d, 'one two\nthree');
    assert.equal(r.data.l, 'a\n  b\n# kept\n');
    assert.equal(r.data.k, 'x\n');
    assert.equal(r.styles.d.style, 'folded');
    assert.equal(r.styles.l.style, 'literal');
  });
  test('lists (indented, same-column, flow) and nested maps', () => {
    const r = parseFrontmatter('---\ntools:\n  - view_file\n  - "grep_search"\nt2:\n- a\n- b\nflow: [a, "b, c", \'d\']\nmetadata:\n  icon: "🔧"\n  version: 1.0.0\nm: {icon: x, n: 2}\nitems:\n  - name: a\n    cmd: b\n---\n');
    assert.deepEqual(r.data.tools, ['view_file', 'grep_search']);
    assert.deepEqual(r.data.t2, ['a', 'b']);
    assert.deepEqual(r.data.flow, ['a', 'b, c', 'd']);
    assert.deepEqual(r.data.metadata, { icon: '🔧', version: '1.0.0' });
    assert.deepEqual(r.data.m, { icon: 'x', n: 2 });
    assert.deepEqual(r.data.items, [{ name: 'a', cmd: 'b' }]);
    assert.equal(r.styles.tools.style, 'seq');
    assert.equal(r.styles.flow.style, 'flow-seq');
    assert.equal(r.styles['metadata.icon'].style, 'double');
  });
  test('multi-line plain and quoted scalars; unquoted glob; duplicates', () => {
    const r = parseFrontmatter('---\nglobs: **/*.go\nd: plain text\n  continued # comment\nq: "multi\n  line"\nd: again\n---\n');
    assert.equal(r.data.globs, '**/*.go');
    assert.equal(r.styles.globs.style, 'plain');
    assert.equal(r.data.q, 'multi line');
    assert.equal(r.data.d, 'again');
    assert.deepEqual(r.duplicates.map((d) => d.key), ['d']);
  });
  test('missing and unclosed frontmatter never throw', () => {
    assert.equal(parseFrontmatter('# no fm').hasFrontmatter, false);
    const u = parseFrontmatter('---\ntrigger: glob\n');
    assert.equal(u.closed, false);
    assert.ok(u.errors.length > 0);
    assert.equal(splitFrontmatter('---\na: 1\n---\nx\ny').bodyLine, 4);
    const bad = parseYaml('a: "unterminated\nb: [1, 2');
    assert.ok(bad.errors.length > 0);
  });
});

describe('glob pattern classifier', () => {
  test('basename-only rule', () => {
    const lv = (p) => checkGlobPattern(p).map((x) => `${x.level}:${x.code}`);
    assert.deepEqual(lv('**/*.ts'), []);
    assert.deepEqual(lv('**/Dockerfile'), []);
    assert.deepEqual(lv('**/*.test.*'), []);
    assert.deepEqual(lv('**/*auth*'), []);
    assert.deepEqual(lv('**/.env*'), []);
    assert.deepEqual(lv('*.tsx'), ['warn:rule-glob-bare']);
    for (const bad of ['src/**/*.ts', '**/routes/*.tsx', '**/routes/**/*.tsx', '**/src/routes/**', '**/auth/**', '**/.agents/**', 'docs/adr/*.md', '**/adr/*.md', '.agents/**', '**/**/*.ts']) {
      assert.deepEqual(lv(bad), ['error:rule-glob-dir'], bad);
    }
    assert.deepEqual(lv('**\\routes\\*.tsx'), ['error:rule-glob-backslash']);
    assert.deepEqual(lv('**/*.{ts,tsx}'), ['error:rule-glob-brace']);
    assert.deepEqual(lv(''), ['warn:rule-glob-empty']);
    assert.ok(lv('**/*').includes('warn:rule-glob-catchall'));
  });
});

describe('helpers', () => {
  test('kit refs skip placeholders and nested-rule examples', () => {
    const refs = extractKitRefs('See `.agents/guides/languages/rust.md`, `.agents/guides/languages/<id>.md`, .agents/scripts/*.mjs, `.agents/rules/sub/x.md`, .agents/hooks.json, `.agents/rules/00-core.md:12`.').map((r) => r.ref);
    assert.deepEqual(refs, ['.agents/guides/languages/rust.md', '.agents/hooks.json', '.agents/rules/00-core.md']);
  });
  test('links outside code only; includes skipped', () => {
    const links = extractLinks('[a](x.md) `[b](y.md)` @[inc](z.txt)\n```\n[c](w.md)\n```\n[d]: ref.md\n![img](i.png)').map((l) => l.target);
    assert.deepEqual(links, ['x.md', 'i.png', 'ref.md']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('doctor on fixture kits', () => {
  test('good kit passes with no errors and no warnings', () => {
    const res = runDoctor({ root: goodKit() });
    assert.equal(res.errors, 0, formatText(res));
    assert.equal(res.warnings, 0, formatText(res));
    assert.equal(res.ok, true);
    assert.equal(res.counts.rules, 6);
    assert.equal(res.counts.rulesByTrigger.always_on, 2);
    assert.equal(res.counts.skills, 2);
    assert.equal(res.counts.thirdPartySkills, 1);
    assert.equal(res.counts.agents, 2);
    assert.equal(res.counts.hooks, 5);
    assert.equal(res.counts.hookHandlers, 5);
    assert.equal(res.counts.lessonsActive, 1);
    assert.ok(res.budget.tokens > 0 && res.budget.tokens < 1000);
    assert.deepEqual(res.budget.files.map((f) => f.file), ['AGENTS.md', '.agents/GEMINI.md', '.agents/rules/00-core-protocol.md', '.agents/rules/90-lessons.md']);
  });

  test('rule frontmatter defects', () => {
    const res = runDoctor({ root: goodKit((w) => {
      w('.agents/rules/a-nofm.md', '# no frontmatter\n');
      w('.agents/rules/b-notrigger.md', rule('description: "x"'));
      w('.agents/rules/c-badtrigger.md', rule('trigger: alwaysOn\ndescription: "x"'));
      w('.agents/rules/d-nodesc.md', rule('trigger: always_on'));
      w('.agents/rules/e-noglobs.md', rule('trigger: glob\ndescription: "x"'));
      w('.agents/rules/f-list.md', rule('trigger: glob\nglobs:\n  - "**/*.py"\n  - "**/*.go"\ndescription: "x"'));
      w('.agents/rules/g-dup.md', rule('trigger: glob\ntrigger: always_on\ndescription: "x"'));
      w('.agents/rules/h-unclosed.md', '---\ntrigger: always_on\ndescription: "x"\n# body\n');
      w('.agents/rules/i-unquoted.md', rule('trigger: glob\nglobs: **/*.go\ndescription: "x"'));
      w('.agents/rules/j-longdesc.md', rule(`trigger: model_decision\ndescription: "${'y'.repeat(230)}"`));
      w('.agents/rules/k-colon.md', rule('trigger: model_decision\ndescription: Use when: editing things'));
      w('.agents/rules/fw-noguard.md', rule('trigger: model_decision\nglobs: "**/*.vue"\ndescription: "x"'));
    }) });
    expectIssue(res, 'error', 'rule-no-frontmatter', 'a-nofm');
    expectIssue(res, 'error', 'rule-trigger-missing', 'b-notrigger');
    assert.match(expectIssue(res, 'error', 'rule-trigger-invalid', 'c-badtrigger').message, /did you mean always_on/);
    expectIssue(res, 'error', 'rule-description-missing', 'd-nodesc');
    expectIssue(res, 'error', 'rule-globs-missing', 'e-noglobs');
    expectIssue(res, 'error', 'rule-globs-list', 'f-list');
    expectIssue(res, 'error', 'rule-yaml', 'g-dup');
    expectIssue(res, 'error', 'rule-frontmatter-unclosed', 'h-unclosed');
    expectIssue(res, 'warn', 'rule-globs-unquoted', 'i-unquoted');
    assert.ok(!res.issues.some((i) => i.file.includes('i-unquoted') && i.level === 'error'));
    expectIssue(res, 'warn', 'rule-description-long', 'j-longdesc');
    expectIssue(res, 'warn', 'yaml-strict', 'k-colon');
    expectIssue(res, 'warn', 'rule-fw-guard', 'fw-noguard');
    assert.equal(res.ok, false);
  });

  test('glob patterns with directory components, backslashes and braces are errors', () => {
    const res = runDoctor({ root: goodKit((w) => {
      w('.agents/rules/topic-routes.md', rule('trigger: glob\nglobs: "**/*.tsx,src/**/*.ts,**/routes/*.tsx,docs/adr/*.md"\ndescription: "x"'));
      w('.agents/rules/topic-bs.md', rule('trigger: glob\nglobs: "**\\\\routes\\\\*.tsx"\ndescription: "x"'));
      w('.agents/rules/topic-brace.md', rule('trigger: glob\nglobs: "**/*.{ts,tsx}"\ndescription: "x"'));
      w('.agents/rules/topic-md-dir.md', rule('trigger: model_decision\nglobs: ".agents/**"\ndescription: "x"'));
    }) });
    const dirHits = res.issues.filter((i) => i.code === 'rule-glob-dir' && i.file.includes('topic-routes'));
    assert.equal(dirHits.length, 3, formatText(res));
    assert.ok(dirHits.every((i) => i.level === 'error'));
    expectIssue(res, 'error', 'rule-glob-backslash', 'topic-bs');
    expectIssue(res, 'error', 'rule-glob-brace', 'topic-brace');
    expectIssue(res, 'error', 'rule-glob-dir', 'topic-md-dir');
  });

  test('nested rule folders are errors', () => {
    const res = runDoctor({ root: goodKit((w) => { w('.agents/rules/frontend/react.md', rule('trigger: always_on\ndescription: "x"')); }) });
    assert.match(expectIssue(res, 'error', 'rule-nested-dir', 'rules/frontend').message, /1 \.md file/);
  });

  test('size caps per rule kind, include expansion and missing includes', () => {
    const big = (n) => `${'x'.repeat(99)}\n`.repeat(Math.ceil(n / 100));
    const res = runDoctor({ root: goodKit((w) => {
      w('.agents/rules/01-engineering-standards.md', rule('trigger: always_on\ndescription: "x"', big(7100)));
      w('.agents/rules/90-lessons.md', rule('trigger: always_on\ndescription: "x"', `(L-0001)\n${big(4600)}`));
      w('.agents/rules/lang-go.md', rule('trigger: glob\nglobs: "**/*.go"\ndescription: "x"', big(6100)));
      w('.agents/rules/topic-manual.md', rule('trigger: manual\ndescription: "x"', big(24100)));
      w('.agents/rules/topic-inc.md', rule('trigger: model_decision\ndescription: "x"', '@[big](./big.txt)\n'));
      w('.agents/rules/big.txt', big(6500));
      w('.agents/rules/topic-missing-inc.md', rule('trigger: model_decision\ndescription: "x"', '@[gone](./gone.txt)\n'));
    }) });
    for (const f of ['01-engineering-standards', '90-lessons', 'lang-go', 'topic-manual']) expectIssue(res, 'error', 'rule-size', f);
    assert.match(expectIssue(res, 'error', 'rule-size', 'topic-inc').message, /after include expansion/);
    expectIssue(res, 'error', 'rule-include-missing', 'topic-missing-inc');
    assert.match(expectIssue(res, 'error', 'rule-size', 'topic-manual').message, /platform cap/);
  });

  test('03-orchestration.md is validated like any always_on rule', () => {
    const ok = runDoctor({ root: goodKit((w) => {
      w('.agents/rules/03-orchestration.md', rule('trigger: always_on\ndescription: "Orchestrator protocol: lanes, 7 phases, briefs, grading."',
        '# Orchestration\nEXPLORE -> PREPARE -> IMPLEMENT -> REVIEW -> FIX -> TEST -> LEARN\n'));
    }) });
    assert.equal(ok.errors, 0, formatText(ok));
    assert.equal(ok.warnings, 0, formatText(ok));
    assert.equal(ok.counts.rulesByTrigger.always_on, 3);
    assert.ok(ok.budget.files.some((f) => f.file === '.agents/rules/03-orchestration.md'));
    const bad = runDoctor({ root: goodKit((w) => {
      w('.agents/rules/03-orchestration.md', rule('trigger: always_on\ndescription: "x"', `${'x'.repeat(99)}\n`.repeat(71)));
    }) });
    assert.match(expectIssue(bad, 'error', 'rule-size', '03-orchestration').message, /7,000 B kit cap for always_on/);
  });

  test('always-on budget: warn above 9,000 tokens, error above 16,000', () => {
    const body = `${'z'.repeat(99)}\n`.repeat(68);
    const warnKit = runDoctor({ root: goodKit((w) => {
      for (let i = 0; i < 6; i++) w(`.agents/rules/0${i + 1}-core-${i}.md`, rule('trigger: always_on\ndescription: "x"', body));
    }) });
    expectIssue(warnKit, 'warn', 'budget');
    assert.ok(warnKit.budget.tokens > 9000 && warnKit.budget.tokens <= 16000, String(warnKit.budget.tokens));
    const errKit = runDoctor({ root: goodKit((w) => {
      for (let i = 0; i < 10; i++) w(`.agents/rules/0${i}-core-${i}.md`, rule('trigger: always_on\ndescription: "x"', body));
    }) });
    expectIssue(errKit, 'error', 'budget');
  });

  test('skill defects; third-party skills only warn', () => {
    const res = runDoctor({ root: goodKit((w) => {
      w('.agents/skills/bugfix/SKILL.md', '---\nname: bug-fix\ndescription: "Fixes bugs."\nmetadata:\n  icon: "x"\n---\n# Bugfix\n');
      w('.agents/skills/Upper/SKILL.md', '---\nname: Upper\ndescription: "x"\nmetadata:\n  icon: "x"\n---\n');
      w('.agents/skills/nodesc/SKILL.md', '---\nname: nodesc\nmetadata:\n  icon: "x"\n---\n');
      w('.agents/skills/huge/SKILL.md', `---\nname: huge\ndescription: "x"\nmetadata:\n  icon: "x"\n---\n${'line\n'.repeat(510)}`);
      w('.agents/skills/linky/SKILL.md', '---\nname: linky\ndescription: "x"\n---\nSee [missing](references/nope.md) and [ok](https://example.com) and [anchor](#x).\n');
      w('.agents/skills/nofm/SKILL.md', '# no frontmatter\n');
      w('.agents/skills/plan/SKILL.md', '---\nname: plan\ndescription: "x"\nmetadata:\n  icon: "x"\n---\n');
      w('.agents/skills/empty-folder/notes.txt', 'x');
      w('.agents/skills/seo-audit/SKILL.md', '---\nname: seo-audit\ndescription: "x"\n---\nSee [gone](references/gone.md).\n');
      w('.agents/workflows/old.md', '# old workflow\n');
    }) });
    expectIssue(res, 'error', 'skill-name-mismatch', 'bugfix');
    expectIssue(res, 'error', 'skill-name-format', 'Upper');
    expectIssue(res, 'error', 'skill-description-missing', 'nodesc');
    expectIssue(res, 'error', 'skill-too-long', 'huge');
    expectIssue(res, 'error', 'skill-broken-link', 'linky');
    assert.equal(res.issues.filter((i) => i.code === 'skill-broken-link' && i.file.includes('linky')).length, 1);
    expectIssue(res, 'warn', 'skill-icon-missing', 'linky');
    expectIssue(res, 'error', 'skill-no-frontmatter', 'nofm');
    expectIssue(res, 'warn', 'skill-name-collision', 'plan');
    expectIssue(res, 'warn', 'skill-no-skillmd', 'empty-folder');
    expectIssue(res, 'warn', 'skill-broken-link', 'seo-audit');
    assert.ok(!res.issues.some((i) => i.file.includes('seo-audit') && i.level === 'error'));
    expectIssue(res, 'warn', 'workflows-deprecated');
  });

  test('third-party list is the 5 kept skills; a removed one is checked as a kit skill', () => {
    assert.deepEqual([...THIRD_PARTY_SKILLS].sort(), ['architecture-decision-records', 'commit-archaeologist', 'seo-audit',
      'thinking-out-loud', 'vercel-react-best-practices']);
    const res = runDoctor({ root: goodKit((w) => {
      w('.agents/skills/architecture-decision-records/SKILL.md', '---\nname: architecture-decision-records\n---\n# ADR\n');
      w('.agents/skills/remotion-best-practices/SKILL.md', '---\nname: remotion-best-practices\n---\n# Remotion\n');
    }) });
    expectIssue(res, 'warn', 'skill-description-missing', 'architecture-decision-records');
    expectIssue(res, 'error', 'skill-description-missing', 'remotion-best-practices');
    assert.equal(res.counts.thirdPartySkills, 2);
  });

  test('agent defects', () => {
    const res = runDoctor({ root: goodKit((w) => {
      w('.agents/agents/noname.md', '---\ndescription: "x"\n---\n# Role\nsend_message\n');
      w('.agents/agents/badmodel.md', '---\nname: badmodel\ndescription: "x"\nmodel: gemini-3-flash\n---\n# Role\nsend_message\n');
      w('.agents/agents/badtool.md', '---\nname: badtool\ndescription: "x"\ntools:\n  - view_files\n  - multi_replace_file_content\n---\n# Role\nsend_message\n');
      w('.agents/agents/strtools.md', '---\nname: strtools\ndescription: "x"\ntools: "view_file, run_command"\n---\n# Role\nsend_message\n');
      w('.agents/agents/research.md', '---\nname: research\ndescription: "x"\ncommandExecutionPolicy: yolo\nsubagent: "yes"\n---\nno heading here\n');
      w('.agents/agents/folder/agent.md', '---\nname: folder\ndescription: "x"\nmodel: pro\ntools: [view_file, grep_search]\n---\n# Role\nsend_message\n');
    }) });
    expectIssue(res, 'error', 'agent-name-missing', 'noname');
    expectIssue(res, 'error', 'agent-model-invalid', 'badmodel');
    assert.match(expectIssue(res, 'error', 'agent-tool-unknown', 'badtool').message, /did you mean view_file/);
    expectIssue(res, 'warn', 'agent-tool-cli-unavailable', 'badtool');
    expectIssue(res, 'error', 'agent-tools-type', 'strtools');
    expectIssue(res, 'error', 'agent-name-builtin', 'research');
    expectIssue(res, 'error', 'agent-policy-invalid', 'research');
    expectIssue(res, 'warn', 'agent-bool', 'research');
    expectIssue(res, 'warn', 'agent-no-h1', 'research');
    expectIssue(res, 'warn', 'agent-no-send-message', 'research');
    // folder/agent.md has no subagent key, so the hooks treat it as a worker: only roster-* issues (tested below).
    assert.ok(!res.issues.some((i) => i.file.includes('folder/agent.md') && !i.code.startsWith('roster-')), formatText(res));
    expectIssue(res, 'error', 'roster-worker-subagent-flag', 'folder/agent.md');
    assert.equal(res.counts.agents, 8);
  });

  test('hooks.json: invalid JSON', () => {
    const res = runDoctor({ root: goodKit((w) => { w('.agents/hooks.json', '{ "a": { "Stop": [ } }'); }) });
    expectIssue(res, 'error', 'hooks-json-invalid');
  });

  test('hooks.json: schema defects and missing scripts', () => {
    const res = runDoctor({ root: goodKit((w) => {
      w('.agents/hooks.json', JSON.stringify({
        flatNested: { Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'node hooks/quality-gate.mjs' }] }] },
        toolFlat: { PostToolUse: [{ type: 'command', command: 'node hooks/track-tools.mjs' }] },
        missing: { PreInvocation: [{ type: 'command', command: 'node hooks/nope.mjs', timeout: 10 }] },
        weird: { enabled: 'yes', SessionStart: [{ type: 'command', command: 'node hooks/track-tools.mjs' }] },
        badHandler: { PreToolUse: [{ matcher: '(', hooks: [{ type: 'shell', timeout: -1 }] }] },
        notObject: 'node hooks/x.mjs',
      }));
    }) });
    assert.match(expectIssue(res, 'error', 'hooks-shape').message, /./);
    assert.ok(res.issues.some((i) => i.code === 'hooks-shape' && /flatNested\.Stop\[0\]/.test(i.message)), formatText(res));
    assert.ok(res.issues.some((i) => i.code === 'hooks-shape' && /toolFlat\.PostToolUse\[0\]/.test(i.message)));
    assert.ok(res.issues.some((i) => i.code === 'hooks-shape' && /weird\.enabled/.test(i.message)));
    assert.ok(res.issues.some((i) => i.code === 'hooks-shape' && /notObject/.test(i.message)));
    assert.match(expectIssue(res, 'error', 'hooks-script-missing').message, /hooks\/nope\.mjs/);
    expectIssue(res, 'warn', 'hooks-unknown-key');
    expectIssue(res, 'error', 'hooks-matcher');
    expectIssue(res, 'error', 'hooks-handler');
  });

  test('stray AGENTS.md / GEMINI.md', () => {
    const res = runDoctor({ root: goodKit((w) => {
      w('.agents/guides/AGENTS.md', '# oops\n');
      w('.agents/AGENTS.md', '# oops\n');
      w('src/feature/GEMINI.md', '# dir rule\n');
      w('src/other/agents.md', '# case variant\n');
      w('dist/AGENTS.md', '# build output ignored\n');
    }) });
    expectIssue(res, 'error', 'stray-directory-rule', '.agents/guides/AGENTS.md');
    expectIssue(res, 'error', 'stray-directory-rule', '.agents/AGENTS.md');
    expectIssue(res, 'warn', 'stray-directory-rule', 'src/feature/GEMINI.md');
    expectIssue(res, 'warn', 'stray-directory-rule', 'src/other/agents.md');
    const files = res.issues.filter((i) => i.code === 'stray-directory-rule').map((i) => i.file);
    assert.ok(!files.some((f) => /node_modules|\.scratch|dist|vercel-react/.test(f)), files.join(', '));
  });

  test('links from rules to guides must exist', () => {
    const res = runDoctor({ root: goodKit((w) => {
      w('.agents/rules/lang-rust.md', rule('trigger: glob\nglobs: "**/*.rs,**/Cargo.toml"\ndescription: "Rust."', 'Deep guide: `.agents/guides/languages/rust.md`\nAlso [x](../guides/languages/zig.md) and `.agents/scripts/missing.mjs`.\nTemplate: `.agents/guides/languages/<id>.md`\n'));
      w('.agents/skills/verify/SKILL.md', '---\nname: verify\ndescription: "x"\nmetadata:\n  icon: "x"\n---\nSee `.agents/guides/principles/nope.md`.\n');
    }) });
    const guideErrors = res.issues.filter((i) => i.level === 'error' && i.file.includes('lang-rust'));
    assert.equal(guideErrors.length, 2, formatText(res));
    assert.ok(guideErrors.some((i) => i.code === 'ref-missing' && /rust\.md/.test(i.message)));
    assert.ok(guideErrors.some((i) => i.code === 'link-broken' && /zig\.md/.test(i.message)));
    expectIssue(res, 'warn', 'ref-missing', 'lang-rust');
    expectIssue(res, 'warn', 'ref-missing', 'skills/verify');
  });

  test('lessons ledger checks', () => {
    const res = runDoctor({ root: goodKit((w) => {
      w('.agents/memory/lessons.md', '# Lessons ledger\n## Active\n- [L-0001] scope:a | +0 -0 | 2026-09-24 | one thing because x | evidence: e\n- [L-0001] scope:b | +0 -0 | 2026-09-24 | two thing because y | evidence: e\n- L-0003 broken line\n## Retired\n');
      w('.agents/rules/90-lessons.md', rule('trigger: always_on\ndescription: "x"', '- thing (L-0001)\n- other (L-0042)\n'));
    }) });
    expectIssue(res, 'error', 'lessons-duplicate-id');
    expectIssue(res, 'warn', 'lessons-format');
    assert.match(expectIssue(res, 'warn', 'lessons-promoted-unknown').message, /L-0042/);
  });

  test('missing .agents directory is an error', () => {
    const root = path.join(TMP, `empty-${++seq}`);
    fs.mkdirSync(root, { recursive: true });
    const res = runDoctor({ root });
    expectIssue(res, 'error', 'kit-missing');
  });
});

describe('doctor roster checks (orchestrator mode)', () => {
  const rosterCodes = (res) => res.issues.filter((i) => i.code.startsWith('roster-')).map((i) => `${i.level} ${i.code} ${i.file}`);

  test('the good fixture kit and the real kit have no roster issues', () => {
    assert.deepEqual(rosterCodes(runDoctor({ root: goodKit() })), []);
    const real = runDoctor();
    assert.deepEqual(rosterCodes(real), [], formatText(real, { quiet: true }));
  });

  test('TYPE_PHASE parsed from the real hooks/lib.mjs equals the hooks WORKER_TYPES roster', () => {
    const text = fs.readFileSync(path.resolve(HERE, '..', '..', 'hooks', 'lib.mjs'), 'utf8');
    assert.deepEqual(parseTypePhase(text), WORKER_TYPES);
    assert.deepEqual(parseTypePhase('const TYPE_PHASE = {\n  a: "X", "b-c": "Y", \'d\': "Z",\n};'), ['a', 'b-c', 'd']);
    assert.equal(parseTypePhase('export const phaseOf = () => "OTHER";'), null);
  });

  test('a worker that lists invoke_subagent is an error', () => {
    const res = runDoctor({ root: goodKit((w) => {
      w('.agents/agents/explorer.md', WORKER('explorer', { tools: ['view_file', 'invoke_subagent'] }));
    }) });
    const hit = expectIssue(res, 'error', 'roster-worker-delegates', 'agents/explorer.md');
    assert.ok(hit.line > 0);
  });

  test('a worker without a tools list inherits invoke_subagent: error', () => {
    const res = runDoctor({ root: goodKit((w) => { w('.agents/agents/explorer.md', WORKER('explorer', { tools: null })); }) });
    expectIssue(res, 'error', 'roster-worker-no-tools', 'agents/explorer.md');
  });

  test('the orchestrator with any write tool, or with no tools list, is an error', () => {
    for (const t of ['write_to_file', 'replace_file_content', 'multi_replace_file_content']) {
      const res = runDoctor({ root: goodKit((w) => { w('.agents/agents/orchestrator.md', ORCH_AGENT(['view_file', 'invoke_subagent', t])); }) });
      assert.match(expectIssue(res, 'error', 'roster-orchestrator-writes', 'agents/orchestrator.md').message, new RegExp(t));
    }
    const none = runDoctor({ root: goodKit((w) => { w('.agents/agents/orchestrator.md', ORCH_AGENT(null)); }) });
    assert.match(expectIssue(none, 'error', 'roster-orchestrator-writes', 'agents/orchestrator.md').message, /no tools list/);
  });

  test('an orchestrator marked subagent: true is an error', () => {
    const res = runDoctor({ root: goodKit((w) => {
      w('.agents/agents/orchestrator.md', ORCH_AGENT().replace('subagent: false', 'subagent: true').replace('# Role\n', '# Role\nYou are a WORKER (x). '));
      w('.agents/hooks/lib.mjs', 'const TYPE_PHASE = { explorer: "EXPLORE", orchestrator: "OTHER" };\n');
    }) });
    expectIssue(res, 'error', 'roster-orchestrator-subagent', 'agents/orchestrator.md');
  });

  test('a worker missing from TYPE_PHASE is an error; a stale TYPE_PHASE entry warns', () => {
    const res = runDoctor({ root: goodKit((w) => {
      w('.agents/agents/helper.md', WORKER('helper'));
      w('.agents/hooks/lib.mjs', 'const TYPE_PHASE = { explorer: "EXPLORE", ghost: "REVIEW" };\n');
    }) });
    assert.match(expectIssue(res, 'error', 'roster-worker-unmapped', 'agents/helper.md').message, /"helper" is not in TYPE_PHASE/);
    assert.match(expectIssue(res, 'warn', 'roster-typemap-stale', 'hooks/lib.mjs').message, /"ghost"/);
    assert.ok(!res.issues.some((i) => i.code === 'roster-worker-unmapped' && i.file.includes('explorer')), formatText(res));
  });

  test('hooks/lib.mjs without a TYPE_PHASE literal is an error; no lib.mjs skips the mapping check', () => {
    const bad = runDoctor({ root: goodKit((w) => { w('.agents/hooks/lib.mjs', 'export const TYPES = {};\n'); }) });
    expectIssue(bad, 'error', 'roster-typemap-missing', 'hooks/lib.mjs');
    const none = runDoctor({ root: goodKit((w, root) => { fs.rmSync(path.join(root, '.agents/hooks/lib.mjs')); }) });
    assert.deepEqual(rosterCodes(none), []);
  });

  test('a worker body without the "You are a WORKER" role line is an error', () => {
    const res = runDoctor({ root: goodKit((w) => { w('.agents/agents/explorer.md', WORKER('explorer', { role: false })); }) });
    expectIssue(res, 'error', 'roster-worker-role', 'agents/explorer.md');
    const mid = runDoctor({ root: goodKit((w) => {
      w('.agents/agents/explorer.md', WORKER('explorer', { role: false }).replace('One task.', 'One task. You are a WORKER inline.'));
    }) });
    expectIssue(mid, 'error', 'roster-worker-role', 'agents/explorer.md');
  });

  test('the orchestrator guard must be registered, enabled, for invoke_subagent and the write tools', () => {
    const hooks = (def) => (w) => w('.agents/hooks.json', JSON.stringify({ 'frontier-orchestrator-guard': def }));
    const handler = [{ type: 'command', command: 'node hooks/orchestrator-guard.mjs', timeout: 5 }];
    const missing = runDoctor({ root: goodKit(hooks({ Stop: [{ type: 'command', command: 'node hooks/quality-gate.mjs' }] })) });
    assert.match(expectIssue(missing, 'error', 'roster-guard-missing', 'hooks.json').message, /invoke_subagent, write_to_file, replace_file_content, multi_replace_file_content/);
    const disabled = runDoctor({ root: goodKit(hooks({ enabled: false, PreToolUse: [{ matcher: GUARD_MATCHER, hooks: handler }] })) });
    expectIssue(disabled, 'error', 'roster-guard-missing', 'hooks.json');
    const noDispatch = runDoctor({ root: goodKit(hooks({ PreToolUse: [{ matcher: 'write_to_file|replace_file_content|multi_replace_file_content', hooks: handler }] })) });
    const m = expectIssue(noDispatch, 'error', 'roster-guard-missing', 'hooks.json').message;
    assert.match(m, /for invoke_subagent;/);
    const wrongScript = runDoctor({ root: goodKit(hooks({ PreToolUse: [{ matcher: GUARD_MATCHER, hooks: [{ type: 'command', command: 'node hooks/track-tools.mjs' }] }] })) });
    expectIssue(wrongScript, 'error', 'roster-guard-missing', 'hooks.json');
    const noFile = runDoctor({ root: goodKit((w, root) => { fs.rmSync(path.join(root, '.agents/hooks.json')); }) });
    expectIssue(noFile, 'error', 'roster-guard-missing');
    const star = runDoctor({ root: goodKit(hooks({ PreToolUse: [{ matcher: '*', hooks: handler }] })) });
    assert.deepEqual(rosterCodes(star), []);
  });

  test('kits without an orchestrator agent skip the guard check', () => {
    const res = runDoctor({ root: goodKit((w, root) => {
      fs.rmSync(path.join(root, '.agents/agents/orchestrator.md'));
      w('.agents/hooks.json', JSON.stringify({ gate: { Stop: [{ type: 'command', command: 'node hooks/quality-gate.mjs' }] } }));
    }) });
    assert.deepEqual(rosterCodes(res), []);
  });

  test('a worker without a boolean subagent: true is still a worker: flag error plus every roster check', () => {
    const tools = ['view_file', 'invoke_subagent'];
    for (const [label, edit] of [['missing', (t) => t.replace('subagent: true\n', '')], ['string', (t) => t.replace('subagent: true', 'subagent: "true"')]]) {
      const res = runDoctor({ root: goodKit((w) => { w('.agents/agents/explorer.md', edit(WORKER('explorer', { tools, role: false }))); }) });
      const flag = expectIssue(res, 'error', 'roster-worker-subagent-flag', 'agents/explorer.md');
      assert.match(flag.message, label === 'missing' ? /subagent is missing/ : /subagent is "true"/);
      expectIssue(res, 'error', 'roster-worker-delegates', 'agents/explorer.md');
      expectIssue(res, 'error', 'roster-worker-role', 'agents/explorer.md');
    }
    const unmapped = runDoctor({ root: goodKit((w) => { w('.agents/agents/helper.md', WORKER('helper').replace('subagent: true\n', '')); }) });
    expectIssue(unmapped, 'error', 'roster-worker-unmapped', 'agents/helper.md');
  });

  test('TYPE_PHASE parsing ignores comments and returns phases', () => {
    const lib = 'const TYPE_PHASE = { // note: {see} docs, x: "Y"\n  explorer: "EXPLORE", /* ghost: "REVIEW", } */ \'e2e\': \'TEST\', "a-b": "FIX",\n};\nconst OTHER = { z: "Q" };';
    assert.deepEqual(parseTypePhase(lib), ['explorer', 'e2e', 'a-b']);
    assert.deepEqual(parseTypePhaseMap(lib), { explorer: 'EXPLORE', e2e: 'TEST', 'a-b': 'FIX' });
    assert.equal(parseTypePhaseMap('const TYPE_PHASE = { a: "X"'), null);
    const res = runDoctor({ root: goodKit((w) => { w('.agents/hooks/lib.mjs', `${lib}\n`); }) });
    assert.ok(!res.issues.some((i) => i.code === 'roster-worker-unmapped' || i.code === 'roster-typemap-missing'), formatText(res));
  });

  test('a role line only inside a code block does not count; a role-line phase that disagrees with TYPE_PHASE warns', () => {
    const fenced = runDoctor({ root: goodKit((w) => {
      w('.agents/agents/explorer.md', WORKER('explorer', { role: false }).replace('One task.', 'One task.\n```md\nYou are a WORKER (EXPLORE phase).\n```'));
    }) });
    expectIssue(fenced, 'error', 'roster-worker-role', 'agents/explorer.md');
    const wrong = runDoctor({ root: goodKit((w) => { w('.agents/agents/explorer.md', WORKER('explorer').replace('(EXPLORE phase)', '(REVIEW phase)')); }) });
    assert.match(expectIssue(wrong, 'warn', 'roster-worker-phase', 'agents/explorer.md').message, /REVIEW phase but TYPE_PHASE maps "explorer" to EXPLORE/);
    const detail = runDoctor({ root: goodKit((w) => { w('.agents/agents/explorer.md', WORKER('explorer').replace('(EXPLORE phase)', '(explore phase, read-only)')); }) });
    assert.ok(!detail.issues.some((i) => i.code === 'roster-worker-phase'), formatText(detail));
  });

  test('a guard registration whose handler is not a command hook does not count', () => {
    const res = runDoctor({ root: goodKit((w) => w('.agents/hooks.json', JSON.stringify({ g: { PreToolUse: [{ matcher: GUARD_MATCHER, hooks: [{ type: 'prompt', command: 'node hooks/orchestrator-guard.mjs' }] }] } }))) });
    expectIssue(res, 'error', 'roster-guard-missing', 'hooks.json');
  });

  test('matcher helpers', () => {
    assert.equal(matcherMatches('*', 'invoke_subagent'), true);
    assert.equal(matcherMatches(undefined, 'invoke_subagent'), true);
    assert.equal(matcherMatches('write_to_file|invoke_subagent', 'invoke_subagent'), true);
    assert.equal(matcherMatches('invoke', 'invoke_subagent'), false);
    assert.equal(matcherMatches('(', 'invoke_subagent'), false);
    const all = guardedTools({ g: { PreToolUse: [{ matcher: GUARD_MATCHER, hooks: [{ command: 'node "hooks\\orchestrator-guard.mjs"' }] }] } });
    assert.deepEqual([...all].sort(), [...GUARD_TOOLS].sort());
    assert.equal(guardedTools(null).size, 0);
  });
});

describe('doctor CLI', () => {
  const run = (...args) => spawnSync(process.execPath, [DOCTOR, ...args], { encoding: 'utf8', timeout: 60000 });
  test('exit 0 + PASS on a good kit; --quiet prints only the summary', () => {
    const root = goodKit();
    const r = run('--root', root, '--quiet');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.stdout.trim(), 'DOCTOR: PASS (0 errors, 0 warnings)');
    const full = run('--root', root);
    assert.equal(full.status, 0);
    assert.match(full.stdout, /always-on budget: ~\d+ tokens/);
  });
  test('exit 1 + FAIL with problems; --json is parseable', () => {
    const root = goodKit((w) => { w('.agents/rules/bad.md', rule('trigger: glob\nglobs: "src/**/*.ts"\ndescription: "x"')); });
    const r = run('--root', root, '--quiet');
    assert.equal(r.status, 1);
    const lines = r.stdout.trim().split(/\r?\n/);
    assert.match(lines[0], /^ERROR \.agents\/rules\/bad\.md:\d+ \[rule-glob-dir\]/);
    assert.match(lines[lines.length - 1], /^DOCTOR: FAIL \(1 error, 0 warnings\)$/);
    const j = run('--root', root, '--json');
    assert.equal(j.status, 1);
    const parsed = JSON.parse(j.stdout);
    assert.equal(parsed.ok, false);
    assert.deepEqual(codes(parsed, 'error'), ['rule-glob-dir']);
  });
  test('--help exits 0; unknown arguments exit 2', () => {
    const h = run('--help');
    assert.equal(h.status, 0);
    assert.match(h.stdout, /Usage: node \.agents\/scripts\/doctor\.mjs/);
    const bad = run('--bogus');
    assert.equal(bad.status, 2);
  });
});
