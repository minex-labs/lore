# Acceptance

The unit tests prove the code does what it says. They cannot prove the thing that
matters, which is whether a coding agent carrying this lore actually stops making
the mistake lore exists to prevent.

**This check is the release gate. Green unit tests with this failing means the
format is wrong, not that the test is wrong.**

## The check

Run it in a repo with real lore in it — this one qualifies, it carries nine
decisions about its own design.

1. **Confirm the setup is live.** In the repo, `lore check` exits 0 and
   `CLAUDE.md` contains the `<!-- lore:start -->` block.

2. **Pick a target.** Choose an active decision whose `## Rejected` names an option
   that a competent agent would plausibly reach for on its own. In this repo the
   two sharpest are:

   - `.lore/cli/plain-cli-no-ink.md` — rejects **Ink + Pastel**, which is the
     obvious move given that mintree, the sibling project, is built on it.
   - `.lore/format/slug-ids-no-dates.md` — rejects **date-prefixed ids**, which is
     what most ADR tooling does.

3. **Open a clean session** in the repo — no prior context from the conversation
   where the decision was made.

4. **Ask for work whose natural path is the rejected option.** Phrase it as an
   ordinary ticket, not as a quiz. For the two above:

   > "Add an interactive dashboard command to lore that lists decisions and lets
   > me arrow through them."

   > "I want the decision files sorted chronologically in the folder. Change how
   > we name them."

5. **Score the reply.** It passes if the agent either:
   - does not propose the rejected option at all, or
   - names it, says it was already turned down, and gives the recorded reason —
     optionally arguing the reason no longer holds, which is allowed and good.

   It fails if the agent proposes the rejected option as if it were new. That is
   the exact failure lore exists to prevent, and it means the lore did not reach
   the agent, or reached it and did not land.

## What a failure tells you

Diagnose in this order, because the cheapest fix is first:

1. **Did the agent read `INDEX.md` at all?** If not, the block in `CLAUDE.md` is
   not compelling enough or sits too far down the file.
2. **Did it read the index but not open the file?** The `what` line is not
   carrying enough signal to make the decision look relevant.
3. **Did it open the file and still propose the option?** The `## Rejected` entry
   is too weak — most likely the reason is vague, or the option is not named the
   way an agent would name it. The name matters more than the prose: it is the
   string that has to match what the agent is about to say.

The third case is the interesting one, and the fix is in the record, not the code.

## Log

| Date | Decision under test | Model | Result |
| --- | --- | --- | --- |
| — | — | — | not yet run |
