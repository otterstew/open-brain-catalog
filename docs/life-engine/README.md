# Life Engine — staged files for the Mac

Files here are **staged for copying onto the Mac**, not run from this repo. The
Life Engine lives at `~/.claude/skills/life-engine/` and is driven by launchd;
a remote container has no launchd, no Apple Reminders, and no credentials.

Same pattern as the existing task "Copy the build-portfolio skill onto the Mac".

## `tasks.sh` — Step 1 of `../life-engine-tasks-migration.md`

Install with:

```bash
cp docs/life-engine/tasks.sh ~/.claude/skills/life-engine/tasks.sh
chmod 755 ~/.claude/skills/life-engine/tasks.sh
```

Then check it against `reminders.sh` for how that script sources config and
prints, and reconcile — the work order asks for local conventions to win, and
`reminders.sh` was not visible from the session that wrote this.

Reads `OPEN_BRAIN_URL` and `MCP_ACCESS_KEY` from the environment. Prints a JSON
array of task objects on stdout and exits 0; on any failure prints **nothing**
on stdout, a reason on stderr, and exits non-zero.

### Deviations from the skeleton in the work order

- Explicit empty-body check. The work order requires an empty body to fail
  loudly; the skeleton had no such check.
- The payload is buffered and validated before anything reaches stdout, so a
  half-parsed response cannot leak a partial or `null` list to the caller.
- The array type is asserted, so a JSON object in `result.content[0].text`
  fails rather than flowing on as a task list.
- `--fail-with-body` now surfaces the error body in the message. The skeleton
  fetched it and discarded it, which loses the server's reason for a 401.

The skeleton's `jq -e '.error' ... && { exit 1; }` line was checked against
`set -euo pipefail` and is safe — bash does not exit on a failed AND-OR head —
but it was rewritten as an `if` for legibility.

### Test evidence

Exercised end to end against a local stub of the MCP endpoint, using a real
`list_tasks` response captured from the live server. All cases pass: every
failure exits non-zero with a readable message and zero bytes on stdout.

| fixture | expected | result |
| --- | --- | --- |
| plain JSON success | exit 0, tasks | pass |
| SSE (`data:` lines) success | exit 0, tasks | pass |
| genuinely empty list `[]` | exit 0, `[]` | pass |
| JSON-RPC `error` member | exit 1 | pass |
| HTTP 401 / 500 | exit 1, body shown | pass |
| empty 200 body | exit 1 | pass |
| non-JSON body (HTML) | exit 1 | pass |
| no `result.content[0].text` | exit 1 | pass |
| `text` not JSON | exit 1 | pass |
| `text` a JSON object, not array | exit 1 | pass |
| wrong `x-brain-key` | exit 1 | pass |
| connection refused | exit 1 | pass |
| `OPEN_BRAIN_URL` / `MCP_ACCESS_KEY` unset | exit 1 | pass |

Not yet run against the live endpoint — that needs the key, which stays on the
Mac. Step 1 is only finished once it has been.
