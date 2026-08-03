// Thin Telegram Bot API wrapper. Loads the token from backend/.env automatically.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, "..", ".env");

// Load .env once (Node 20.6+ / 24 built-in), regardless of the current working directory.
if (!process.env.TELEGRAM_BOT_TOKEN && existsSync(ENV_PATH)) {
  try {
    process.loadEnvFile(ENV_PATH);
  } catch {
    /* fall through to the clear error below */
  }
}

const API = (token, method) => `https://api.telegram.org/bot${token}/${method}`;

function token() {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN missing — check backend/.env");
  return t;
}

export async function sendMessage(chatId, text, { silent = false } = {}) {
  const res = await fetch(API(token(), "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_notification: silent,
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram sendMessage failed: ${data.description}`);
  return data.result;
}

/** Send a message with inline ✅/❌ buttons carrying opaque callback tokens. */
export async function sendConfirm(chatId, text, { yesData, noData }) {
  const res = await fetch(API(token(), "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ אשר", callback_data: yesData },
          { text: "❌ בטל", callback_data: noData },
        ]],
      },
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram sendConfirm failed: ${data.description}`);
  return data.result;
}

/** Acknowledge a button tap (removes the "loading" spinner on the user's client). */
export async function answerCallback(callbackQueryId, text) {
  await fetch(API(token(), "answerCallbackQuery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

/** Replace an existing message's buttons/text (e.g. after a confirmation is resolved). */
export async function editMessageText(chatId, messageId, text) {
  await fetch(API(token(), "editMessageText"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" }),
  });
}

/**
 * Long-poll for updates. Pass the last offset+1 to acknowledge processed updates.
 * `timeout` is seconds Telegram holds the connection open when idle.
 */
export async function getUpdates({ offset, timeout = 25 } = {}) {
  const params = new URLSearchParams();
  if (offset != null) params.set("offset", String(offset));
  params.set("timeout", String(timeout));
  const res = await fetch(`${API(token(), "getUpdates")}?${params}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram getUpdates failed: ${data.description}`);
  return data.result;
}

export async function getMe() {
  const res = await fetch(API(token(), "getMe"));
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram getMe failed: ${data.description}`);
  return data.result;
}
