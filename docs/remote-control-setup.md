# Remote Control — making it the default on the Mac

Written 27 Aug 2026. Notes for setting up Claude Code Remote Control so cloud
sessions can reach the Mac.

## The one thing to do

On the Mac, either:

```bash
mkdir -p ~/.claude && f=~/.claude/settings.json && [ -f "$f" ] || echo '{}' > "$f" && \
tmp=$(mktemp) && jq '.remoteControlAtStartup = true' "$f" > "$tmp" && mv "$tmp" "$f"
```

or inside Claude Code: `/config` → **Enable Remote Control for all sessions** → `true`.

Desktop app equivalent: **Settings → Claude Code → Enable remote control by default**.

## Why this can't be done from a cloud session

Two independent reasons, both hard:

1. **Remote Control is outbound-only.** The Mac initiates the connection to
   Anthropic's servers. Nothing dials in. A cloud container has no channel to
   start a process on the Mac, regardless of authorisation given.

2. **Project settings deliberately ignore it.** From the docs:

   > In project or local settings (`.claude/settings.json`,
   > `.claude/settings.local.json`), Claude Code honors a `false` and turns
   > auto-connect off for that repository, but **ignores a `true`**, so a
   > checked-in file can't turn on Remote Control for everyone who opens the
   > repository.

   So adding `remoteControlAtStartup: true` to this repo's `.claude/settings.json`
   would be silently ignored. It must live in the user-level
   `~/.claude/settings.json`.

## What auto-connect does and does not give you

- **Does:** every interactive `claude` session started on the Mac connects
  automatically, and shows up in cloud sessions via `ListAgents`, messageable
  with `SendMessage`.
- **Does not:** make the Mac reachable when no session is running. Auto-connect
  is per-session, not a daemon. Lid closed with no session up = nothing to reach.

If persistent reachability is wanted, that is a different setup — a long-lived
`claude remote-control` server process on the Mac, kept alive by launchd. Worth
considering alongside the Life Engine tick, which already runs under launchd.

## Manual invocations, for reference

| Command | Effect |
|---|---|
| `claude --remote-control` (or `--rc`) | Start an interactive session with Remote Control on |
| `/remote-control` (or `/rc`) | Turn it on for a session already running |
| `claude remote-control` | Run as a server; serves sessions on demand |

Useful server flags: `--spawn worktree` (isolated git worktree per session),
`--capacity N`, `--remote-control-session-name-prefix <prefix>`.

## Gotchas that silently disable it

Any of these env vars set will disable the feature-flag evaluation Remote
Control depends on, producing "Remote Control isn't enabled for this account":

`DISABLE_TELEMETRY`, `DO_NOT_TRACK`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`,
`DISABLE_GROWTHBOOK`

Check the shell environment and the `env` block of any `settings.json`.
`claude doctor` reports details.

## Related

- `docs/life-engine-tasks-migration.md` — the work order that needs a Mac
  session to execute. Blocked until Remote Control is up, or until it is run
  on the Mac directly.

Source: https://code.claude.com/docs/en/remote-control
