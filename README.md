<h1 align="center">lore</h1>

<p align="center">
  <strong>The decisions your team already made, where the agent will read them</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@minex-labs/lore"><img src="https://img.shields.io/npm/v/@minex-labs/lore.svg" alt="npm version"></a>
  <a href="https://github.com/minex-labs/lore/actions/workflows/ci.yml"><img src="https://github.com/minex-labs/lore/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/minex-labs/lore/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@minex-labs/lore.svg" alt="license"></a>
</p>

<p align="center">
  Stop your coding agent from picking the library you rejected last quarter.
</p>

---

Your coding agent does not know what you already decided. So it picks the library
you rejected last quarter, rebuilds the pattern you solved a different way, and
revives the architecture you retired in March. Those decisions exist — they are
just scattered across chat logs, Notion pages, Slack threads, and your head.

`lore` keeps them as versioned markdown next to the code, and hands the agent the
few that matter for the ticket at hand.

The governing principle is **the minimum lore needed**. The failure mode of tools
like this is not too little context, it is dumping everything and drowning the
agent. Curation, not accumulation.

## The unit is the decision

Not the document. Each record carries what was decided, why, and **what was
rejected and why** — the field that stops an agent rediscovering the option you
already threw out.

```markdown
---
id: postgres-over-dynamo
what: Use Postgres as the primary store, not DynamoDB
scope: [backend, data]
status: active
date: 2026-08-11
source: https://www.notion.so/acme/store-decision-abc123
paths: [packages/api/**]
---

## Why

Las queries del dashboard son inherentemente relacionales (joins entre tenant,
sitio y evento). Con Postgres son una query; con Dynamo eran tres round-trips.

## Rejected

- **DynamoDB** — access patterns rígidos: cada vista nueva del dashboard pedía un
  GSI nuevo. Lo modelamos en el spike de julio y a la tercera vista ya no cerraba.
```

Write the body in whatever language you think in — that friction is what stops
people recording decisions at all. Only `what` and the field names are fixed to
English, because `what` is the line every agent reads.

Full spec: [`docs/format.md`](docs/format.md).

## How the agent gets it

`lore init` writes a block into your `CLAUDE.md` pointing the agent at
`.lore/INDEX.md`, which is one line per active decision:

```markdown
# Lore index

9 active decisions. Open the full file at `.lore/*/<id>.md`.

## global  (always read)
- `no-secrets-in-repo` — Keep secrets in 1Password, never in the repo

## backend
- `postgres-over-dynamo` — Use Postgres as the primary store, not DynamoDB
- `raw-sql-no-orm` — Write SQL by hand, no ORM

## data
> Also applies here: `postgres-over-dynamo`
```

That is the whole budget: cheap enough to read on every session, specific enough
to decide which two or three files to open. Superseded decisions stay on disk but
leave the index — what stops an agent reviving one is the `## Rejected` list of the
decision that replaced it, which is exactly where `lore supersede` puts it.

`lore for <path>` closes the other direction: given a file, which decisions govern
it. It follows grep's exit convention and prints nothing on a miss, so it can back
a `PreToolUse` hook without drowning you in output.

## Where lore looks for `.lore/`

It walks up from the current directory and **stops at the root of the git repo**.

That means a package inside a monorepo finds the `.lore/` at the repo root, which
is the point — but a repo nested inside another repo never sees, or writes into,
the outer one's lore. A decision recorded while standing in a nested repo would
otherwise be versioned in a repo that does not govern it and may not even be
cloned alongside it.

Worktrees and submodules are handled: in both, `.git` is a file rather than a
directory, and both count as their own repo root.

If a nearby `.lore/` is outside the boundary, commands say so rather than pretend
it does not exist. `lore init --local` creates a `.lore/` in the current directory
even when the repo root already has one.

## Commands

```
lore init                      set up .lore/ and wire the block into CLAUDE.md
lore add                       record a decision, interactively
lore add --json                …or from an object on stdin (this is the agent's door)
lore list [--scope] [--status] see what is there
lore show <id>                 print one decision
lore for <path>                which decisions govern this file
lore index                     regenerate INDEX.md
lore supersede <old> --by <new>  retire a decision, keeping the history
lore revoke <id>               retire one with no replacement — by recording the
                               decision that undoes it
lore check [--strict]          validate; wire into CI or a pre-commit hook
lore harvest <file...>         turn past discussions into proposals
lore review                    approve or discard proposals, one screen each
```

## What it costs to read

`lore check` reports size, because the governing principle only holds if someone
is measuring it:

```
· global/ + INDEX.md   9240 chars (~2310 tokens) are read on every session, over
                       the 8000 budget. Heaviest: strict-ts (2260), … Move what is
                       not truly global to an area
· backend/orm.md       ## Why is 1774 chars (budget 600) — trim it to the decision
                       and its reason; the background belongs behind the `source` link
```

The number that matters is the first one. The block lore writes into `CLAUDE.md`
says to read everything under `global` on every session, so `INDEX.md` + `global/`
is a fixed cost paid by every ticket. A long decision in a niche area is read by
whoever touches that area; one in `global` is read by everyone, always.

Both budgets are configurable in `config.yml` (`budget.why`, `budget.always_read`).
The defaults come from measurement: across a lore whose records this tool considers
good, `## Why` runs 184–393 characters.

**Size is reported, never enforced — not even under `--strict`.** Everything lore
calls an error makes the lore *wrong*: bad frontmatter, a dangling supersede, a
stale index. A long record is not wrong, it is just expensive, and it may well be
worth it. And the asymmetry is brutal: `lore check --strict` runs in merge gates,
so a check that fails on prose gets pulled out of the gate — taking the checks that
were catching real breakage with it.

## How decisions get in

Three ways, in descending order of quality:

1. **`lore add`** — you, at a prompt. Goes straight into the lore.
2. **The agent, mid-session** — via `lore add --json`. Lands in `.lore/inbox/` and
   does not count as lore until `lore review` approves it. A wrong entry there
   costs one keystroke; a wrong entry in the lore misleads every agent after it.
3. **`lore harvest`** — recovers decisions from old sessions, PR descriptions,
   Notion pages, Slack threads. Also lands in the inbox.

### When `--approved` is the right call

`--approved` skips the inbox. The rule of thumb is that it is for humans, not for
agents — but the line that actually matters is *when the human approved*, not who
typed the command.

Adopting lore in an existing repo is the case worth naming: a person curates the
list of decisions — id, `what`, area, source — and an agent transcribes them from
prose that was already reviewed. The approval happened **before** anything was
written, so routing it through the inbox adds nothing. Worse, migration has two
halves that belong together — writing the decision and deleting the old paragraph
— and if the decision waits in `inbox/`, the repo sits with neither the old prose
nor its replacement, on `main`, until someone runs `lore review`.

So: `--approved` for a list a human curated first. The inbox for anything decided
mid-ticket. Note that nothing on disk tells the two apart afterwards — the record
of who approved a migration is the pull request that carried it, so say so there.

There are no connectors, and there never will be. lore does not call APIs: your
agent already has Notion and Slack access with your credentials, so it reads the
source itself and pipes JSON into `lore add`. Ingestion is a schema on stdin.

## Install

Requires Node ≥ 20.

```
npm install -g @minex-labs/lore
```

## Status

Early but working, and used on itself: this repo carries its own `.lore/`, and
CI runs `lore check --strict` against it on every push. The design decisions behind
lore live in `.lore/`, not in prose — including the ones about ids, statuses and the
review gate, each with the options that were turned down.

The release gate is not the unit tests. It is
[`docs/acceptance.md`](docs/acceptance.md): a clean session, a ticket whose natural
path is a rejected option, and whether the agent proposes it anyway.

## License

MIT
