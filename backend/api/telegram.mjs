// Telegram webhook (Vercel). Telegram POSTs each update here.
// Always returns 200 quickly so Telegram doesn't retry-storm on a handler error.

import { getClient } from "../lib/google-auth.mjs";
import { handleMessage, handleCallback } from "../lib/handlers.mjs";
import { NeonStore } from "../lib/pending-store.mjs";
import { NeonTaskStore } from "../lib/task-store.mjs";
import { sql } from "../lib/db.mjs";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok");

  // Verify the secret Telegram echoes back (set at setWebhook time).
  const secret = req.headers["x-telegram-bot-api-secret-token"];
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).send("unauthorized");
  }

  const update = req.body;
  try {
    const auth = await getClient();
    const store = new NeonStore(sql);
    const tasks = new NeonTaskStore(sql);
    if (update?.message) await handleMessage(auth, update.message, store, { tasks });
    else if (update?.callback_query) await handleCallback(auth, update.callback_query, store, { tasks });
  } catch (err) {
    console.error("webhook error:", err);
  }
  return res.status(200).send("ok");
}
