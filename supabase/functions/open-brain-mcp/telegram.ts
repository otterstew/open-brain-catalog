// Sending Stewart a Telegram message from the Open Brain server.
//
// Cloud sessions and Cowork tasks can reach this connector but not the Mac,
// where the old send-message.sh lives, so this is how they reach his phone.
// The recipient is fixed (TELEGRAM_CHAT_ID, Stewart's own chat): a caller can
// choose the words, never who gets them. Plain text only, so nothing in the
// message can turn into Telegram formatting or a link preview.

export const TELEGRAM_MAX = 3500;

export function checkTelegramText(raw: unknown): { text: string } | { problem: string } {
  if (typeof raw !== "string") return { problem: "the message must be text" };
  // Drop control characters except new lines and tabs, then trim.
  const text = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!text) return { problem: "the message is empty" };
  if (text.length > TELEGRAM_MAX) {
    return { problem: `the message is ${text.length} characters; the limit is ${TELEGRAM_MAX}. Shorten it.` };
  }
  return { text };
}

// Never let the bot token appear in an error that goes back to the caller.
export function hideToken(message: string, token: string): string {
  return token ? message.split(token).join("[token]") : message;
}

export async function sendTelegram(token: string, chatId: string, text: string): Promise<{ ok: true } | { problem: string }> {
  if (!token) return { problem: "TELEGRAM_BOT_TOKEN is not set on the server" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (r.ok) return { ok: true };
    const body = await r.text();
    return { problem: hideToken(`Telegram said ${r.status}: ${body.slice(0, 200)}`, token) };
  } catch (e) {
    return { problem: hideToken(`could not reach Telegram: ${(e as Error).message}`, token) };
  }
}
