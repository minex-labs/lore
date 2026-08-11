# lore

> Status: early. The command surface below is the target for v1; see `CLAUDE.md`
> for what is settled and what is still being built.

Your coding agent does not know what you already decided. So it picks the library
you rejected last quarter, rebuilds the pattern you solved a different way, and
revives the architecture you retired in March. Those decisions exist — they are
just scattered across chat logs, Notion pages, Slack threads, and your head.

`lore` keeps them as versioned markdown next to the code, and hands the agent the
few that matter for the ticket at hand.

## The unit is the decision

Not the document. Each record carries what was decided, why, **what was rejected and
why** — the field that stops an agent from rediscovering the option you already threw
out — plus the areas it applies to and whether it still holds.

```markdown
---
id: postgres-over-dynamo
what: Use Postgres as the primary store, not DynamoDB
scope: [backend, data]
status: active
date: 2026-08-11
---

## Why

Las queries del dashboard son inherentemente relacionales...

## Rejected

- **DynamoDB** — access patterns rígidos: cada vista nueva pedía un GSI nuevo...
```

## Commands

```
lore init                    set up .lore/ and wire the block into CLAUDE.md
lore add                     record a decision (interactive, or --json on stdin)
lore list / show / for       read what is there
lore index                   regenerate INDEX.md
lore supersede / revoke      retire a decision without losing the history
lore check                   validate; wire it into CI or a pre-commit hook
lore harvest / review        seed lore from past discussions, behind a review gate
```

## Install

Not published yet.

## License

MIT
