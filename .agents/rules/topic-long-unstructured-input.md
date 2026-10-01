---
trigger: model_decision
description: "Apply when a user message is a long ramble or dictation: voice-typing preamble, weak punctuation, restarts, reversals ('actually no, scrap that'), or 'let me think out loud' / 'interview me'."
---
# Long unstructured input - topic rule
Full contract: the installed `thinking-out-loud` skill (`.agents/skills/thinking-out-loud/SKILL.md`, echo format in its `references/echo-format.md`). Evidence and labelling rules: `.agents/rules/02-evidence-and-communication.md`. Who: the ORCHESTRATOR (the agent the user talks to); a worker's brief is already structured, so workers skip this rule.

## Skip when
The request is short and clear; the text is long but already structured (a pasted spec or document); it is a direct question; or the user wants a verbatim transcript, minutes or a cleanup of their dictation. Then act normally.

## Protocol
1. Act on nothing. No commands, plans, task boards or worker dispatches until the user approves the echo. The echo comes BEFORE any plan artifact.
2. Reply with ONE echo, well under 250 words, one line per bullet, nothing twice, no "you said" recap. Exactly these five `##` sections, in order:
   - Mission: one sentence, what the user is actually trying to achieve.
   - Locked (your decisions and constraints): mark the stated top priority with **top priority**.
   - Open (needs your answer): questions the ramble raised but did not answer. Vague quantifiers ("the usual model", "standard size", "soon") go here or under Guessed, never into Locked.
   - Ledger: `Flipped: <A>, then <B>. Going with B.` and `Parked: <tangent>`.
   - My additions (correct these first): `Inferred: ...` (strongly implied) and `Guessed: ...` (gaps you filled).
3. Close with exactly: "Correct anything that's off, especially My additions. Want the interview for the Open items?"
4. Interview only if the user accepts or asked for it up front: one question per message, highest information gain first, each with a one-clause reason why it matters, at most 5. Stop when answers stop changing the brief, then restate only the sections that changed.
5. Capture mode (the user says they will ramble across several messages): acknowledge once ("Go ahead, I'm listening. Say 'done' when you want the echo."), then reply with one short line such as "Listening." per message. Answer a direct question in at most 2 sentences. On "done", "echo", "that's it" or "what did you get", deliver the echo.
6. After approval, offer where to keep the brief: (a) `docs/rambles/YYYY-MM-DD-<topic>.md` (an `implementer` task), (b) durable project facts into root `AGENTS.md` (the `scribe`), (c) conversation only. Then run the pipeline (`/orchestrate`) and paste the approved brief into every worker's CONTEXT. The approved brief governs the session: do not re-ask Locked items.

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER present a guess in the user's voice - confident misreadings feel like knowledge and never become questions. Instead: put it under My additions as Inferred or Guessed.
2. NEVER silently average or pick between reversed positions. Instead: a `Flipped:` line that adopts the later one.
3. NEVER drop a tangent. Instead: `Parked:`.
4. NEVER remark on typos, homophones, filler or restarts - resolve them silently and keep the user's own vocabulary and project names.
5. NEVER save the brief anywhere without asking.

## Example - bad -> good
Input (dictated): "ok switching to voice sorry for typos, i want the morning digest thing, slack, actually no email is better, rank by relevance to what im building thats the whole point, my cofounder wants it too so two profiles i guess, could sell it later whatever"

BAD: starts creating `digest/` with a Slack bot and a "relevance" keyword filter.

GOOD (the skill's template headings, one line per bullet):
```markdown
## Mission
A daily digest ranked by relevance to what you are building, for two people.
## Locked (your decisions and constraints)
- **top priority**: ranking by relevance to your current work
- Email delivery
- Two recipients with different interest profiles (you, cofounder)
## Open (needs your answer)
- What time and timezone is "morning"?
- How is relevance measured: a written profile, repo activity, keywords?
## Ledger
- Flipped: Slack, then email. Going with email.
- Parked: selling it later.
## My additions (correct these first)
- Inferred: ranking is per recipient.
- Guessed: items come from Hacker News.
Correct anything that's off, especially My additions. Want the interview for the Open items?
```

## Before finishing
- [ ] No tool ran before the echo was approved
- [ ] Every flip, tangent, vague quantifier and guess appears exactly once, in the right section
