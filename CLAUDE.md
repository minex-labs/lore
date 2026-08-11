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

## Decisions already made (do not re-litigate)

| Topic | Decision |
| --- | --- |
| Name | `lore`. Binary is `lore`, npm package is `@minex/lore`. Settled — do not propose alternatives. |
| Runtime | Node ≥ 20, TypeScript ESM, strict. |
| CLI style | Plain CLI on `node:util parseArgs`. **No Ink, no React, no CLI framework.** Startup time is a feature: this runs on every agent session. |
| Interactive prompts | `@clack/prompts`, dynamically imported inside `lore add` only, so no other command pays for it. |
| Deps | `yaml` (frontmatter), `zod` (schema), `picomatch` (path globs). Keep this list short; every dependency is startup cost. |
| Storage | Markdown files under `.lore/`, versioned in the repo, grouped by area, plus a generated `INDEX.md`. No database, no server. |
| Consumption | The agent reads files. A block in the target repo's `CLAUDE.md` tells it to read `.lore/INDEX.md` first. |
| Decision id | Slug only — `postgres-over-dynamo`, no date prefix. Unique across the whole repo; the filename must equal the id. The date lives in the frontmatter. |
| Statuses | `active` and `superseded`. Nothing else. Retiring a decision is itself a decision — see below. |
| Index contents | Only `active` decisions. Superseded ones stay on disk and are reachable via `lore list --status superseded`. |
| Generated files | `INDEX.md` is derived output with a "do not edit" header. Mutating commands regenerate it; `lore check` fails when it is stale. |
| `dist/` | Not committed. Built by `prepublishOnly`. (mintree commits it to survive `npm i -g github:…`; if we ever need that here, revisit.) |
| Tests | `node --test` with `tsx`. Lint with eslint + prettier, tabs, width 100 — same as mintree. |

### Retiring a decision without a replacement

There is no `revoked` status. Dropping something *is* a decision: it gets its own
record ("Stop using Redis; queue state lives in Postgres"), and the old decision is
superseded by it. This keeps one invariant — **every retired decision points at a
live one** — which matters because nobody opens superseded files. What actually
protects the codebase is the `## Rejected` section of a decision that is still
active. `lore revoke` is sugar over add + supersede, not a new state.

---

## Language rule

This one is deliberate and mixed. Do not "fix" it toward one language.

- **English**: source code, comments, identifiers, CLI output and prompts, README,
  this file, decision frontmatter keys, status values, and the `what` field of every
  decision (it is what shows up in `INDEX.md`).
- **Spanish**: the body of decision records — `## Why` and `## Rejected`.

The reason: the body is written by the repo owner, in a hurry, right after making
the call. Forcing it into a second language is exactly the friction that stops
people from recording decisions at all. The `what` line stays English because the
index is the file every agent reads.

---

## Layout

```
source/
  cli.ts              entry point, nothing but argv → run()
  app.ts              router; testable, no process access
  commands/           one file per command
  lib/                model, parser, serializer, index generation
test/                 node --test, mirrors source/
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
  that did not happen.
- Both `lore add` modes — interactive and `--json` on stdin — build the same object
  and go through the same zod schema. One validation path, no exceptions.
- `INDEX.md` is never written by hand, including by you.
