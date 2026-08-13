# CLAUDE.md

How we work in this repo. Read this before writing code.

---

## What lore is

A CLI that keeps the decisions a team has already made in versioned markdown next
to the code, and feeds the relevant ones to a coding agent before it starts a
ticket — so the agent stops picking libraries we rejected, redoing patterns we
solved, or reviving architectures we retired.

The unit of content is the **decision**, not the document.

## The governing principle: the minimum lore needed

The failure mode of tools like this is not too little context — it is dumping
everything and drowning the agent. Every design question is answered with "is this
the minimum the agent needs in order not to get it wrong?", never "how do we store
more?". Curation, not accumulation.

If a change makes `INDEX.md` bigger without making an agent measurably less wrong,
it is the wrong change.

---

## Where the decisions live

**In `.lore/`, not in this file.** This repo uses itself: the design decisions
behind lore — why the CLI has no framework, why ids carry no date, why the review
gate is a directory rather than a status — are decision records, with the options
we turned down and why. Read `.lore/INDEX.md` before proposing a change to any of
it, exactly as the block at the bottom of this file tells you to.

What stays here is the stuff that is true but was never a choice between real
alternatives: conventions, layout, and how to run things.

| Topic | Value |
| --- | --- |
| Name | `lore`. Binary is `lore`, npm package is `@minex-labs/lore`. Settled — do not propose alternatives. |
| Runtime | Node ≥ 20, TypeScript ESM, strict. |
| Deps | `yaml` (frontmatter), `zod` (schema), `picomatch` (globs), `@clack/prompts` (interactive only, dynamically imported). Keep this list short; every dependency is startup cost. |
| Storage | Markdown files under `.lore/`, versioned in the repo, grouped by area, plus a generated `INDEX.md`. No database, no server. |
| Consumption | The agent reads files. A block in the target repo's `CLAUDE.md` points it at `.lore/INDEX.md`. |
| Generated files | `INDEX.md` is derived output with a "do not edit" header. Mutating commands regenerate it; `lore check` fails when it is stale. |
| `dist/` | Not committed. Built by `prepublishOnly`. (mintree commits it to survive `npm i -g github:…`; if we ever need that here, revisit.) |
| Tests | `node --test` with `tsx`. Lint with eslint + prettier, tabs, width 100 — same as mintree. |
| `lore for` | Built as a hook engine: `--json`, and grep's exit convention (0 = matched, 1 = no match and total silence, 2 = error). |
| `.lore/` lookup | Walks up, stops at the git repo root (`.git` as file **or** directory, so worktrees and submodules count). Never reads or writes across a repo boundary. |

---

## Layout

```
source/
  cli.ts              entry point, nothing but argv → run()
  app.ts              router; testable, no process access
  commands/           one file per command, loaded on demand
  lib/                model, parser, serializer, index, checks
test/                 node --test, mirrors source/
docs/                 format spec and the CLAUDE.md block, both test-pinned
```

## Commands

```
npm run build     compile to dist/
npm test          node --test via tsx
npm run lint      eslint (prettier runs as a lint rule)
npm run format    prettier --write
```

## Working agreements

- A command that is not implemented exits non-zero. Never print success for work
  that did not happen — including "wrote X" when nothing changed.
- Both `lore add` modes — interactive and `--json` on stdin — build the same object
  and go through the same zod schema. One validation path, no exceptions.
- `INDEX.md` is never written by hand, including by you.
- `docs/format.md` and `docs/claude-block.md` are pinned by tests to the code they
  document. Edit the code, then re-sync the doc — never the other way round.
- The startup path is a budget with a test behind it (`test/startup.test.ts`); see
  `.lore/cli/startup-budget.md` before adding an import to `app.ts`.

<!-- lore:start -->
## Project lore

`.lore/` holds the decisions this project already made. Read them before you write
code, and add to them when a decision gets made.

### Reading

1. Read `.lore/INDEX.md`. Always read every decision under `## global`.
2. Read the sections for the areas your ticket touches. Open the full file
   (`.lore/*/<id>.md`) for the ones that look relevant — not for all of them.
3. Before editing a file, `lore for <path>` lists the decisions that govern it.
4. A decision's `## Rejected` section lists options already discarded, and why. If
   you are about to propose one of them, don't — unless the stated reason no longer
   holds, in which case say so out loud and explain what changed.

### Writing

Record a decision with `lore add --json` (object on stdin; `lore add --schema` for
the payload). Send a short explicit `id` — it appears on every line of the index.
Never write files under `.lore/` by hand, and never touch `INDEX.md`.

Record it only if ALL FOUR hold:

- **There was a real alternative.** Something a competent person could have picked
  instead, and might propose again next month. No alternative, no decision.
- **The reason is not readable from the code.** If someone could open the repo and
  work it out, the code already says it. Don't repeat it here.
- **It outlives this ticket.** It governs code not yet written, not just the lines
  you are touching now.
- **It was chosen, not discovered.** "The library doesn't support X" is a fact.
  "We're dropping the library because of it" is a decision.

Do NOT record:

- How the code turned out — naming, file layout, this handler returning 404.
- Anything the linter, formatter, or type checker already enforces.
- Implementation details a future refactor can change without asking anyone.
- Something already in the index. If it is a nuance of an existing decision,
  supersede or amend that one instead of adding a near-duplicate.

There is no cap on how many you record. A long session can legitimately produce
several; most sessions produce none. Apply the four tests to each candidate on its
own — don't pad the list, and don't ration it either.

Every proposal must clear this bar, which is what keeps review fast enough to
actually happen:

- **`source` points at the specific thing** — a quoted line from this session, a PR
  number, a URL. Not "we discussed it". It is what makes a proposal checkable
  instead of something the user has to take on faith.
- **`## Rejected` names the alternative.** If you cannot name what was almost
  chosen instead, you don't have a decision, you have a description.
- **The record is reviewable in under 30 seconds** — `what` in one line, `## Why`
  in three sentences or fewer.
- **You checked `INDEX.md` first** for something that already covers it.

If you are unsure, do not write it — say so in one line when you finish, and let
the user decide.

Everything you record lands in `.lore/inbox/` and does not count as lore until the
user approves it. That is deliberate: a wrong entry there costs one keystroke to
discard, while a wrong entry in the lore misleads every agent that comes after you.
<!-- lore:end -->
