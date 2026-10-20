---
name: codex-review
description: Use when reviewing a working diff, a pull request, or the current uncommitted changes for correctness, security, performance, or maintainability — or when the user asks for a review. Runs the review in an independent fork so the parent session's context does not bias the verdict.
---

# Reviewing a change with an independent fork

Review your own or another engineer's change the way a careful second reader would: find bugs the author would fix if they knew, and skip noise. Run the review through `subagent_fork` so the reviewer starts from the completed conversation but reaches its own verdict; do not review in-thread, where the same history that produced the change biases the finding.

## What to flag

Flag a finding only when it satisfies every condition:

- It meaningfully affects correctness, security, performance, or maintainability.
- It is discrete and actionable, not a general observation about the codebase.
- It was introduced by this change; do not flag pre-existing bugs.
- The author would plausibly fix it once told.

Do not flag speculative breakage — name the code that is provably affected. Do not invent findings merely because a rule file exists.

## How to report

- One finding per comment, with a `[P0]`–`[P3]` priority prefix (`[P0]` drop everything, `[P1]` next cycle, `[P2]` eventually, `[P3]` nice to have).
- A one-paragraph body stating why it is a bug, its severity without exaggeration, and the inputs or environments it depends on. Cite files, lines, and functions.
- Keep the tone matter-of-fact; no praise like "Great job" or "Thanks for".
- End with an `overall correctness` verdict — "patch is correct" or "patch is incorrect" — where correct means existing code and tests keep passing and the patch carries no blocking bug.

## Scope the review

Review the uncommitted diff (`git diff` plus untracked files) or the named change, whichever the user asked for. Limit each finding's line range to the few lines that pinpoint the problem. If nothing qualifies, say so rather than padding a list.
