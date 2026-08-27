> Working copy of the Open Brain note *"Work order — Life Engine: replace Apple
> Reminders with Open Brain tasks"* (thought id `d935a85e-f436-4bcd-aec6-3991043a16e4`,
> published 27 Aug 2026). Saved here so the migration is restartable if a session
> stalls. Steps 0–5 must run on the Mac: they need Apple Reminders, the
> `~/.claude/skills/life-engine/` scripts, and the launchd agent, none of which
> exist in a remote container. The Open Brain side (`list_tasks` over HTTPS) has
> been verified working from a remote session.

# Work order — Life Engine: replace Apple Reminders with Open Brain tasks

Written 27 Aug 2026 for a Claude Code session on the Mac. It is a work order,
not a script to run blind — read it, then do it in order. Stop and ask if a step
disagrees with what you find on disk. Save a copy into the repo (e.g.
`docs/life-engine-tasks-migration.md`) before starting, so the work is
restartable if the session stalls.

## Why

The Life Engine's external pull is calendar + Apple Reminders. Reminders cannot
be read at all when the tick runs under launchd (no way to grant Automation
permission to a launchd job), so most cycles are half blind. Open Brain now owns
tasks (`create_task`, `list_tasks`, `complete_task`, `update_task`) in the same
Supabase project, reachable over plain HTTPS with the existing access key.
Decision taken: **Apple Reminders is dropped entirely.** One list, and it is the
one that works.

## Where things live

- Skill: `~/.claude/skills/life-engine/` (`SKILL.md`, `tick.sh`,
  `fetch-replies.sh`, `send-message.sh`, `reminders.sh`, `schema.sql`, `tick.log`)
- Scheduler: `~/Library/LaunchAgents/com.stewartmorpurgo.life-engine.plist`
- Tool allowlist: `~/.claude/settings.json`
- Open Brain MCP: Supabase Edge Function `open-brain-mcp`, project ref
  `uftlxeahciewiitclkbu`. Auth header `x-brain-key`, checked against the
  `MCP_ACCESS_KEY` secret.

**Credentials:** the key lives in `openbraincredentialtrackerforclaude.ods`
(Step 5). **Never open that file for writing, never edit it, never overwrite
it.** Read the value out, or better, reuse whatever env var the existing scripts
already use. Do not paste the key into any file that is committed.

---

## Step 0 — Migrate before you cut

Do this first and in one pass, from an interactive session (which *can* read
Reminders; the launchd tick cannot).

1. Read every incomplete Apple Reminder: title, due date, notes, list name.
2. For each, call Open Brain `create_task` with:
   - `title` — as written
   - `due_date` — `YYYY-MM-DD`, only if it genuinely had one
   - `notes` — carry across verbatim
   - `project` — map the Reminders list name to a project label; reuse existing
     Open Brain project names where they match (`open brain`, etc.) rather than
     inventing near-duplicates
   - `status` — `next` if it is actionable now, `inbox` if it needs thinking
     about, `waiting` if it is blocked on someone else
   - `source` — `"reminders-migration"`
3. Print a table of what moved before writing anything, and get a yes.
4. After the import, list the new tasks back and eyeball for duplicates against
   what is already in Open Brain. Several things may exist in both places.
5. Leave Apple Reminders alone — do not delete anything there. It becomes a
   dormant backup; Stewart can clear it by hand later.

---

## Step 1 — `tasks.sh`

Create `~/.claude/skills/life-engine/tasks.sh`, mode 755. Model it on the
existing `reminders.sh` for how it sources config and prints — match local
conventions rather than the sketch below where they differ.

Behaviour:

- One JSON-RPC `tools/call` to the Open Brain MCP endpoint, tool `list_tasks`,
  arguments `{"format":"json","due_before":"<today>","limit":50}`.
  `include_deferred` stays absent (defaults off) — deferred work must not nag.
- Headers: `x-brain-key: $MCP_ACCESS_KEY`, `content-type: application/json`,
  and `accept: application/json, text/event-stream` (the server patches a
  missing Accept, but send it properly).
- The transport may reply as SSE. Handle both a bare JSON body and
  `data: {...}` lines.
- Unwrap `result.content[0].text`, which is itself a JSON array of task objects.
- **Failure is loud.** On non-2xx, curl error, empty body, a JSON-RPC `error`
  member, or unparseable payload: write the reason to stderr and exit non-zero.
  Do not emit an empty list on failure — an empty list means "nothing due",
  which is a lie that produces a cheerful morning briefing about nothing.

Skeleton:

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${OPEN_BRAIN_URL:?OPEN_BRAIN_URL not set}"
: "${MCP_ACCESS_KEY:?MCP_ACCESS_KEY not set}"

today="$(date +%F)"
body=$(printf '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_tasks","arguments":{"format":"json","due_before":"%s","limit":50}}}' "$today")

raw=$(curl -sS --fail-with-body --max-time 20 "$OPEN_BRAIN_URL" \
  -H "x-brain-key: ${MCP_ACCESS_KEY}" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d "$body") || { echo "tasks.sh: HTTP call failed" >&2; exit 1; }

# SSE or plain JSON
json=$(printf '%s' "$raw" | sed -n 's/^data: //p' | tail -1)
[ -n "$json" ] || json="$raw"

printf '%s' "$json" | jq -e '.error' >/dev/null 2>&1 && {
  echo "tasks.sh: JSON-RPC error: $(printf '%s' "$json" | jq -c .error)" >&2
  exit 1
}

printf '%s' "$json" \
  | jq -e -r '.result.content[0].text' 2>/dev/null \
  | jq -e '.' \
  || { echo "tasks.sh: could not parse task payload" >&2; exit 1; }
```

Verify by running it by hand and confirming real tasks come back, then verify
the failure path by running it with a deliberately wrong key and confirming a
non-zero exit and a readable message.

---

## Step 2 — `tick.sh`

- Remove the `reminders.sh` call.
- Add the `tasks.sh` call in the same position in the cycle (external pull,
  before Open Brain enrichment — order matters, you cannot enrich what you have
  not seen).
- **Do not let a tasks failure pass silently.** If `tasks.sh` exits non-zero,
  the session must still run, but it must be told that the task pull failed and
  instructed to say so in whatever message it sends, rather than implying the
  list is clear. If the cycle would otherwise have been silent, a failure is
  worth one short message — a broken pull is exactly the thing that hides for
  days. Log the failure to `tick.log` either way.
- Pass the task JSON in the prompt itself. Do not hand a scheduled session a
  `/var/folders` temp file — it cannot read one.

---

## Step 3 — `SKILL.md`

- Step 3 of the rhythm: external pull is now **calendar events + Open Brain
  tasks** (overdue, due today, and `waiting` items that have aged). Reminders
  gone.
- Morning briefing: count overdue tasks, name the two or three oldest, varying
  which ones across days rather than nagging the same ones daily. Carry the
  existing wording over from the Reminders version.
- Step 4 enrichment: tasks carry `thought_id`. When present, fetch that thought
  directly rather than semantic-searching for context — it is the note the task
  came out of.
- Meeting prep: where a task's `project` matches the event, surface it.
- Inbound handling gains a fork. An obligation ("remind me to…", "I need to…",
  "don't let me forget…") becomes `create_task` with `source: "life-engine"`.
  Anything else stays `capture_thought` as now. When it is genuinely both, do
  both and pass the thought id as `thought_id`.
- Inbound `done: <text>` (or "finished X", "did X") → `list_tasks` with
  `search:` to find the match → `complete_task`. If more than one matches, ask
  rather than guess. Repeats are handled server-side, so do not create the next
  instance by hand.
- Delete every remaining mention of Apple Reminders, including the two lines in
  "What it cannot do" about not writing to Reminders and not reading them under
  launchd. Both are about to be untrue.

---

## Step 4 — allowlist and cleanup

- `~/.claude/settings.json`: remove the `reminders.sh` entry, add `tasks.sh`.
  Keep it a **named allowlist** — do not widen it, and do not disable permission
  checks. The engine reads text other people wrote and treats it as data.
- `git rm` (or move aside) `reminders.sh` once a full tick has run green.
- Commit as the tick normally commits.

---

## Step 5 — verify

1. Run one tick by hand; confirm tasks appear and Reminders is not consulted.
2. Break the key deliberately, run again, and confirm the failure is **visible**
   in the Telegram message and in `tick.log`, not swallowed.
3. Send the bot "remind me to test the task fork tomorrow" and confirm a task
   appears in Open Brain with a due date.
4. Send "done: test the task fork" and confirm it completes.
5. Wait for one launchd-scheduled tick and confirm tasks still come through —
   this is the whole point, since Reminders never could.

---

## Step 6 — update the archive

The Open Brain note **"Life Engine: what it does and how it works with Open
Brain"** (id `479bf396-317e-4601-9b21-68626dda668d`) describes the old
behaviour. After verification, use `update_thought` to correct:

- the moving-parts table (`reminders.sh` → `tasks.sh`)
- the rhythm section (external pull)
- "What it cannot do" — both Reminders lines out
- the interaction section — tasks are now a third channel alongside reading
  thoughts and writing them

Also close out any migration tasks you created along the way.
