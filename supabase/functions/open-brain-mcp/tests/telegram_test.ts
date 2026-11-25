// Tests for checking a Telegram message before it is sent.
//   deno run --no-config supabase/functions/open-brain-mcp/tests/telegram_test.ts

import { checkTelegramText, hideToken, TELEGRAM_MAX } from "../telegram.ts";

let pass = 0, fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log(`FAIL ${label}\n  got  ${g}\n  want ${w}`); }
}

eq("text trimmed", checkTelegramText("  hello \n"), { text: "hello" });
eq("new lines kept", checkTelegramText("a\nb"), { text: "a\nb" });
eq("control characters dropped", checkTelegramText("a\u0007b\u001Bc"), { text: "abc" });
eq("empty refused", "problem" in checkTelegramText("   "), true);
eq("not text refused", "problem" in checkTelegramText(42), true);
eq("at the limit allowed", "text" in checkTelegramText("x".repeat(TELEGRAM_MAX)), true);
eq("over the limit refused", "problem" in checkTelegramText("x".repeat(TELEGRAM_MAX + 1)), true);
eq("token hidden", hideToken("url /bot123:ABC/sendMessage failed", "123:ABC"), "url /bot[token]/sendMessage failed");
eq("no token, message unchanged", hideToken("plain", ""), "plain");

console.log(`${pass} passed, ${fail} failed`);
if (fail) Deno.exit(1);
