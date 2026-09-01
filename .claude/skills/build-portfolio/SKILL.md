---
name: build-portfolio
description: Keep the Build Portfolio note in Open Brain current. Use when a piece of the system has matured enough to record, when a new design note is captured, when something is abandoned, when asked what has been built or how the pieces fit together, or when reviewing whether the portfolio is still true.
---

# Keeping the Build Portfolio current

The Build Portfolio is one note in Open Brain — id
**`ccdf3bca-a026-4403-b4f0-f648892e2f91`** — and it is the index of everything
that has been designed: the pieces, how they hold together, and what each is
worth to Stewart, to other people, and to a business.

Every other design note describes one piece. This one describes the shape they
make together. Keep it that way: **if a paragraph here could live in a piece's
own note instead, it belongs there.**

Two boundaries worth holding:

- **Against the changelog.** The changelog says what moved; the portfolio says
  what exists and why it is worth having. A bug fix is a changelog entry and
  nothing more. It reaches the portfolio only when it changes what a piece *is*,
  or when it is a measured defect worth admitting to a reader.
- **Against the published page.** The note at
  https://claude.ai/code/artifact/3d0a0c83-a91d-45ec-a569-152495d1a9c2 is
  derived from this note and does not update itself. It deliberately omits the
  note ids, the personal hostname and the paragraph framing the system as
  evidence for a role application. Never republish it as a side effect of
  revising the note — say the page is behind, and let Stewart decide.

## First, read it

```
fetch("ccdf3bca-a026-4403-b4f0-f648892e2f91")
```

Read the whole thing before changing a word of it. It is ~13k characters, which
is cheap; guessing at its current contents is not. Its own closing section,
*Keeping this note honest*, is the authority — this skill is the trigger, that
section is the rule.

## The bar for adding a piece

A piece goes in once **all three** hold:

1. It works end to end, and has been used for real at least once.
2. Someone other than Stewart could follow the description and know what it does.
3. It has a design note of its own, **or** the row is complete enough to stand
   without one — and if it is the latter, name that gap under *the gap to close
   next*.

Anything below the bar stays out. A portfolio that lists intentions is a wish
list, and the note stops being trusted the first time it describes something
that does not work.

## When to revise

| Trigger | What to do |
|---|---|
| A piece crosses the bar | Add its row, place it in the spine, say what it is worth to whom |
| A piece changes what it *is* (not just how it works) | Rewrite its row |
| A piece is abandoned | Keep it, mark it abandoned, give the reason — deleting it invites the idea back |
| A new design note is captured | Add it, and `link_thoughts` in both directions |
| A Filing Round comes round and nothing has changed | Change nothing |

That last row is not filler. A note revised for the sake of revision stops being
a record of what changed.

## How to revise it — the trap

**`update_thought` replaces the content entirely. It is not an append.** Send a
paragraph and the note is gone.

The loop, every time:

1. `fetch` the note and keep the full text.
2. Edit that full text — locally, in a file, not in your head.
3. Add a dated line to the **Revision log** at the foot saying what changed.
4. `update_thought` with the **complete** new text, plus
   `updated_date` set to today.
5. `link_thoughts` for any design note newly referenced, both directions.

Internal references use `[label](thought:<id>)` so a citation opens Stewart's
own copy. Use real ids; a made-up one renders as a dead link with nothing to
diagnose from.

## What to check while you are in there

- **Does each maturity claim still hold?** "In daily use" ages badly. If a piece
  has not been used in a month, say so rather than leaving the old word.
- **Is *the gap to close next* still the real gap?** As of 1 Sep 2026 it is the
  measured retrieval defect: capture embeds only the first 24,000 characters of
  a note and 39% of notes are longer, so about a quarter of the archive's text
  cannot be found by meaning at all.
- **Are the honest caveats intact?** The single shared key, no audit trail,
  external AI processing on capture, no retention schedule, no ethical walls,
  data residency. They are what makes the business section usable in front of
  anyone. Never quietly trim them to make the pitch cleaner.
- **Do the counts still match?** Note totals and tag figures are quoted in
  places; `thought_stats` settles them in one call.

## Where the pieces live

Only part of the system is in this repo, so do not assume a piece is stale
because you cannot see it here.

| Piece | Where |
|---|---|
| Catalog (PWA) | this repo — `index.html`, `sw.js`, `manifest.webmanifest` |
| MCP server, tasks | this repo — `supabase/functions/open-brain-mcp/`, `supabase/migrations/` |
| The four Open Brain skills | `~/Documents/open-brain/.claude/skills/` on the Mac |
| Maintenance scripts | `~/Documents/open-brain/` on the Mac |
| Life Engine | `~/.claude/skills/life-engine/` on the Mac, plus a launchd plist |
| Every design note, and this portfolio | Open Brain itself |

A copy of this skill belongs in `~/Documents/open-brain/.claude/skills/` too, so
it fires during work done there and not only during work done in this repo.

## The monthly routine

A scheduled routine — *Monthly Build Portfolio review*,
`trig_01Lgy6ZVYH7Uy3A8mvG4T1Cf`, 08:00 UTC on the 1st — wakes a fresh session to
do this review even when nobody is working. It is the belt to this skill's
braces: the skill only fires while work is happening, and pieces go stale while
nobody is touching them.

Its expected outcome most months is **no change**. That is a successful run, not
a wasted one.

**A warning that turned out to be false.** The routine was created from a remote
session, where `create_trigger` refuses the `connectors` parameter, and it
carried a caveat that its sessions might therefore wake without the
`mcp__Open_Brain__*` tools. They do not: a scheduled diagnostic on 31 Aug 2026
recorded `calendar OK, gmail OK, openbrain OK, supabase OK` into
`life_engine_briefings`. Scheduled sessions inherit the account's connectors
even though the trigger stores none. What they do *not* get is a computer:
`remote-devices` was absent, so nothing scheduled can reach the Mac.

**Its real weakness** is this skill's own reach. It is not on `main` and not on
the Mac, so the routine has to be told which branch to find it on, and it never
fires for work done in the archive itself. Merging the branch fixes half of
that; the copy onto the Mac fixes the rest.
