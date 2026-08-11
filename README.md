# lore

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

## How decisions get in

Three ways, in descending order of quality:

1. **`lore add`** — you, at a prompt. Goes straight into the lore.
2. **The agent, mid-session** — via `lore add --json`. Lands in `.lore/inbox/` and
   does not count as lore until `lore review` approves it. A wrong entry there
   costs one keystroke; a wrong entry in the lore misleads every agent after it.
3. **`lore harvest`** — recovers decisions from old sessions, PR descriptions,
   Notion pages, Slack threads. Also lands in the inbox.

There are no connectors, and there never will be. lore does not call APIs: your
agent already has Notion and Slack access with your credentials, so it reads the
source itself and pipes JSON into `lore add`. Ingestion is a schema on stdin.

## Install

Requires Node ≥ 20. Not published to npm yet; from a clone:

```
npm install && npm run build && npm link
```

## Status

Working, unpublished, and used on itself: this repo carries its own `.lore/`, and
CI runs `lore check --strict` against it on every push. The design decisions behind
lore live in `.lore/`, not in prose — including the ones about ids, statuses and the
review gate, each with the options that were turned down.

The release gate is not the unit tests. It is
[`docs/acceptance.md`](docs/acceptance.md): a clean session, a ticket whose natural
path is a rejected option, and whether the agent proposes it anyway.

## License

MIT
