# Open Brain Catalog

A personal memory archive. Notes ("thoughts") are captured by meaning and
searched by embedding; tasks live beside them. The whole thing is a single
static page plus one Supabase edge function that speaks MCP, so assistants and
the GUI go through exactly the same tool contract.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | The entire catalog GUI — ~200KB, hand-written, **no build step** |
| `sw.js` | Service worker caching the app shell |
| `supabase/functions/open-brain-mcp/index.ts` | The MCP server: tool registration + Hono HTTP handler |
| `supabase/functions/open-brain-mcp/tasks.ts` | Pure task/date logic, no network, no DB |
| `supabase/migrations/` | Schema, applied in filename order |
| `tests/` | Playwright tests driving the real page |
| `docs/` | Design proposals — read before building the thing they describe |

## Two independent deploy targets

- **The catalog** is served by GitHub Pages from the repo root. Merging to
  `main` publishes it. No workflow, no build.
- **The edge function** is deployed by `.github/workflows/deploy-edge-function.yml`
  on pushes to `main` that touch `supabase/functions/**`. Editing the function
  and merging is what deploys it; editing the catalog does not.

`--no-verify-jwt` in that workflow is **required, not cosmetic**. The function
authenticates on its own `x-brain-key` header; deploying with JWT verification on
rejects every request before it reaches the code.

Migrations are **not** applied by CI. They go through the Supabase MCP tools or
the CLI, deliberately.

## Conventions

**Migrations explain themselves.** Existing migrations carry more comment than
SQL, and the comments argue *why* the shape is what it is and what breaks
otherwise — see `20260820000000_create_tasks.sql`. Match that. A column whose
purpose is obvious today is not obvious in eight months.

**Pure logic gets its own module.** `tasks.ts` exists because date and
recurrence arithmetic is where silent bugs live, and it can only be tested
cheaply if it never touches the network or the database. Anything with that
shape follows it out of `index.ts`.

**Dates are calendar days, in UTC.** Never instants. A task due "tomorrow" must
not become due "today" because the server sits in another timezone.
`parseISODate` rejects 31 February rather than rolling it into March.

**MCP tools return errors, they don't throw.** Every tool wraps its body in
try/catch and returns `{ content: [...], isError: true }` with a sentence a
human could act on. A thrown error reaches the client as a transport fault.

**Tool descriptions are written for the model, not the changelog.** They say
*when* to reach for this tool over a similar one — see `create_task`, which
explains why it is not `capture_thought`.

**Everything goes through the service role.** All tables have RLS on with a
service-role-only policy. Nothing reaches the database except through the edge
function, which gates on `MCP_ACCESS_KEY`. The GUI is no exception: it calls the
same MCP endpoint over JSON-RPC that Claude does.

## Traps that bite silently

**Bump `SHELL_VERSION` in `sw.js` whenever `index.html` changes.** The browser
only re-runs the service worker's install when the script's bytes differ. Ship a
catalog change without bumping it and returning users keep the old page, with no
error anywhere. It is currently 32.

**`PREFERRED_TOPICS` in `index.ts` is a duplicate of `topics.txt`, and
`topics.txt` is not in this repository.** The comment there tells you to run
`tidy-archive.py --check-vocab` after a vocabulary change; that script is not
here either. Until both are, treat vocabulary edits as unverifiable and say so
rather than assuming they are consistent.

**Editing the edge function changes nothing until it is deployed.** It is a
separate target from the page that calls it.

## Testing

Two suites, both hand-rolled, both exit non-zero on failure:

```bash
deno run --no-config supabase/functions/open-brain-mcp/tests/recurrence_test.ts
npm i playwright && node tests/task_view_test.js
```

The Deno tests import the real module rather than a copy, so they cannot pass
against code the server no longer runs. The Playwright test drives the real
`index.html` against a **stubbed MCP server**, so the UI is checked against the
same tool contract the edge function implements — no deployment and no access
key needed. New pure logic joins the first; new UI joins the second.

The Deno suite runs in the deploy workflow before anything reaches the live
server. Add new pure-logic tests to that step.

## Local development

There is **no `supabase/config.toml` in the repo**, so the local stack is not
set up yet — `supabase start` alone will fail. First time:

```bash
supabase init           # creates config.toml; commit it
supabase start          # throwaway Postgres to test migrations against
supabase db reset       # replays supabase/migrations/ from scratch
```

Prefer that over applying a migration straight to the live project, which holds
real notes and will soon hold real bookings. `db reset` replaying cleanly is
also the only proof that the migrations work on an empty database rather than
only on the one they happened to be written against.

The page itself needs no server — open `index.html` from disk, which is exactly
what the Playwright test does.

## Commits

Imperative, specific, no prefixes or tags: *"Pin the tasks_touch search_path"*,
*"Move the pure task logic into its own module"*, *"Actually hide the note-only
controls in task mode"*. Say what changed and, when the reason is not obvious,
why. Never put a model name or identifier in a commit message, PR, or code
comment.

## Work in progress

`docs/vrbo-integration.md` and `docs/wishing-stream-plan.md` are **proposals, not
descriptions** — none of it is built. They cover syncing Vrbo bookings in,
generating the work each booking implies, a direct-booking site, and a CRM built
from confirmed stays. Read the relevant one before implementing any of it; both
contain constraints discovered the hard way (Vrbo's iCal feed carries no guest
details, its off-platform booking policy, and the double-booking risk that comes
with selling direct) that are not obvious from the code.
