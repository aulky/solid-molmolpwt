---
trigger: model_decision
description: "Apply when writing or editing prose for humans: README, docs pages, guides, tutorials, changelogs, release notes, PR descriptions, ADR text, or long code comments. Not for agent rule files."
---
# Docs writing - topic rule
Principles guide: `.agents/guides/principles/documentation.md` - read it before restructuring a docs site or writing a tutorial. Docs-only changes: section `docs-only` of `.agents/skills/orchestrate/references/task-types.md` (a `reviewer` checks every fact and link). ADRs: `topic-architecture-decisions.md`.

## Write for scanners (how real readers read)
Readers take in the first sentence of the first paragraphs, then only the first words of later paragraphs, plus headings, bold text, numbers and link text. So:
1. Front-load: the first screen says what it is, who it is for, why it matters, and how to start (one command).
2. Open every paragraph with its point. Every heading is a label a reader with a question would scan for ("Install", "Configure auth", not "Getting started on your journey").
3. Prefer costly specifics to portable sentences: exact commands, verified versions, numbers, file paths, error messages. A sentence that could move unchanged into any other document on the topic is filler - cut it or make it specific.
4. Reference docs (API, config, CLI, FAQ, changelog): skimmability is the goal. Tables, one item per row, types and defaults shown, no narrative before the answer.
5. Pick one audience per document. Define terms a newcomer would hit; do not explain basics to experts.

## Protocol
1. Write the audience and their job in one line ("new contributor wants to run the tests locally").
2. Outline the headings first; check each heading routes a real question.
3. Write. Copy every command from a run you actually did; show Windows PowerShell and POSIX variants when they differ.
4. Verify: relative links point to existing files, commands run, versions match the manifest or lockfile, code fences have language tags.
5. Missing facts (numbers, incidents, decisions only the user knows): never invent. A worker marks the gap `TODO(<owner>)` and lists the questions under `INPUT GAP:`; the orchestrator interviews the user - one question per message, events not opinions ("what actually happened?", "what did it cost?"), their wording kept, stop after 2-3 concrete answers.

## Style
- Plain words: "use", "help", "show" - not leverage, utilize, facilitate, seamless, robust. Cut "very", "really", "basically", "actually". No "In today's...", "It's worth noting", "In conclusion".
- Active voice; imperative for steps; numbered lists for sequences, bullets for sets. Prefer commas, colons or parentheses to strings of dashes.
- Changelog: newest first, grouped as Added / Changed / Deprecated / Removed / Fixed / Security (Keep a Changelog style), written as user-facing impact.

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER invent facts, numbers, benchmarks, quotes or events - docs are trusted as true. Instead: mark the gap `TODO(<owner>): <missing fact>` and report it as `INPUT GAP:`.
2. NEVER document a command you did not run or a version you did not check. Instead: run it, or label it "untested".
3. NEVER upgrade a vague answer into a specific one ("it took a while" does not become "three weeks").
4. NEVER create files named `AGENTS.md` or `GEMINI.md` for documentation - Antigravity loads them as agent rules.
5. When asked to review prose, NEVER rewrite it wholesale. Instead: findings that quote the exact text, say where the reader stumbles, and offer optional fixes.

## Example - bad -> good
~~~markdown
<!-- BAD -->
# Welcome!
This project is a comprehensive, robust solution that leverages modern
technologies to streamline your workflow.

<!-- GOOD -->
# tally
Command-line tool that totals hours from Toggl and Clockify CSV exports,
for freelancers who invoice by the hour.

```bash
tally ./export.csv --month 2026-08
```
Prints hours per client, rounded to 0.25 h. Needs Node 20 or later.
~~~

## Before finishing
- [ ] First screen answers what / who / why / how to start
- [ ] Every command was run and every link resolves (or is labelled)
- [ ] No invented facts; open gaps marked as TODOs and listed under `INPUT GAP:`
