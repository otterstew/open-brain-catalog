#!/usr/bin/env bash
# Life Engine external pull: tasks due from Open Brain.
#
# Replaces reminders.sh. Prints a JSON array of task objects on stdout and
# exits 0, or prints nothing on stdout, a reason on stderr, and exits non-zero.
# An empty list means "nothing due" and must never be produced by a failure.
set -euo pipefail

: "${OPEN_BRAIN_URL:?OPEN_BRAIN_URL not set}"
: "${MCP_ACCESS_KEY:?MCP_ACCESS_KEY not set}"

die() { echo "tasks.sh: $*" >&2; exit 1; }

today="$(date +%F)"
body=$(printf '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_tasks","arguments":{"format":"json","due_before":"%s","limit":50}}}' "$today")

raw=$(curl -sS --fail-with-body --max-time 20 "$OPEN_BRAIN_URL" \
  -H "x-brain-key: ${MCP_ACCESS_KEY}" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d "$body") || die "HTTP call failed (curl exit $?): $(printf '%s' "${raw:-<no body>}" | head -c 200)"

[ -n "${raw//[[:space:]]/}" ] || die "empty response body"

# The transport may answer as SSE (data: lines) or as a bare JSON body.
json=$(printf '%s' "$raw" | sed -n 's/^data: //p' | tail -1)
[ -n "$json" ] || json="$raw"

printf '%s' "$json" | jq -e . >/dev/null 2>&1 || die "response was not JSON: $(printf '%s' "$raw" | head -c 200)"

if printf '%s' "$json" | jq -e 'has("error")' >/dev/null 2>&1; then
  die "JSON-RPC error: $(printf '%s' "$json" | jq -c .error)"
fi

text=$(printf '%s' "$json" | jq -e -r '.result.content[0].text') \
  || die "no result.content[0].text in response"

# Buffer before printing: nothing reaches stdout unless the payload is good.
tasks=$(printf '%s' "$text" | jq -e .) \
  || die "task payload was not JSON: $(printf '%s' "$text" | head -c 200)"

printf '%s' "$tasks" | jq -e 'type == "array"' >/dev/null \
  || die "task payload was not a JSON array"

printf '%s\n' "$tasks"
