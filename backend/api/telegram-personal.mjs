// Telegram webhook (Vercel) for the personal-calendar bot — a separate bot/token/conversation
// from api/telegram.mjs (the kids' family bot). Telegram POSTs each update here.
// Always returns 200 quickly so Telegram doesn't retry-storm on a handler error.

import { getClient } from "../lib/google-auth.mjs";
import { handleMessage, handleCallback } from "../lib/personal/handlers.mjs";
import { NeonPersonalStore } from "../lib/personal/pending-store.mjs";
import { sql } from "../lib/db.mjs";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok");

  // Verify the secret Telegram echoes back (set at setWebhook time).
  const secret = req.headers["x-telegram-bot-api-secret-token"];
  if (process.env.TELEGRAM_PERSONAL_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_PERSONAL_WEBHOOK_SECRET) {
    return res.status(401).send("unauthorized");
  }

  const update = req.body;
  try {
    const auth = await getClient();
    const store = new NeonPersonalStore(sql);
    if (update?.message) await handleMessage(auth, update.message, store);
    else if (update?.callback_query) await handleCallback(auth, update.callback_query, store);
  } catch (err) {
    console.error("personal webhook error:", err);
  }
  return res.status(200).send("ok");
}
