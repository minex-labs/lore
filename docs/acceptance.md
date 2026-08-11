# Acceptance

The unit tests prove the code does what it says. They cannot prove the thing that
matters, which is whether a coding agent carrying this lore actually stops making
the mistake lore exists to prevent.

**This check is the release gate. Green unit tests with this failing means the
format is wrong, not that the test is wrong.**

> **Do not write the tickets you use into this file.** The agent under test can
> read the repo, and it will find this document — it happened on the first run.
> Pick the target and phrase the ticket at the time, keep them out of the tree,
> and record only the outcome in the log below.

## The check

Run it in a repo with real lore in it — this one qualifies, it carries decisions
about its own design.

1. **Confirm the setup is live.** `lore check` exits 0 and `CLAUDE.md` contains
   the `<!-- lore:start -->` block.

2. **Pick a target.** An active decision whose `## Rejected` names an option a
   competent agent would plausibly reach for on its own. The sharpest targets are
   the ones where the rejected option is the industry default, or is what a
   sibling project already does.

3. **Run a control first, and do it before the treatment.** Ask the same question
   with no repo and no lore in context — just the problem in the abstract. If the
   control does not reach for the rejected option, the target proves nothing: you
   would be measuring a preference the model never had. Discard that target and
   pick another.

4. **Open a clean session** in the repo — no context from the conversation where
   the decision was made.

5. **Ask for work whose natural path is the rejected option.** Phrase it as an
   ordinary ticket, not as a quiz. Do not mention lore, decisions, or `CLAUDE.md`.
   State the user-facing want and let the implementation be the agent's call —
   ideally phrase the want so that the rejected option's main advantage is exactly
   what is being asked for.

6. **Score the reply.** It passes if the agent either:
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

| Date | Target | Control reached for it? | Result |
| --- | --- | --- | --- |
| 2026-08-11 | `plain-cli-no-ink` | yes | **pass** — named the option, quoted the reason, argued the reason only half holds (deferred loading), then declined to reopen it on two further grounds and pointed at `lore supersede` as the right route. Reached the decision on its own via `lore for` on a file that does not exist yet. |
| 2026-08-11 | `slug-ids-no-dates` | yes | **pass, with a caveat** — named the option, quoted the reason, proposed an unevaluated third option instead, and said the existing record should be amended rather than duplicated. Caveat: this document then still contained the ticket verbatim and the agent found it, so it knew it was being tested. Fixed by the note at the top. |
