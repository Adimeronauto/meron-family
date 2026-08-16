// Local polling bot for the personal-calendar bot — for development/testing. Production runs
// the same handlers via the Vercel webhook (api/telegram-personal.mjs). Run: npm run bot:personal

import { appendFileSync } from "node:fs";
import { getClient } from "../lib/google-auth.mjs";
import { getUpdates, getMe } from "../lib/personal/telegram.mjs";
import { handleMessage, handleCallback } from "../lib/personal/handlers.mjs";
import { MemoryStore } from "../lib/pending-store.mjs";

const auth = await getClient();
const store = new MemoryStore();
const me = await getMe();
console.log(`הבוט האישי @${me.username} פועל. Ctrl+C לעצירה.\n`);

// Setup aid: record each sender's chat id — same idea as scripts/telegram-whoami.mjs for the
// family bot, but this one is meant to see only your own chat id.
const onSeen = (chatId, name, text) => {
  console.log(`[msg] chatId=${chatId} (${name}): ${text}`);
  try {
    appendFileSync("seen-chats-personal.log", `${chatId}\t${name}\t${text}\n`);
  } catch { /* non-fatal */ }
};

let offset;
for (;;) {
  let updates;
  try {
    updates = await getUpdates({ offset, timeout: 25 });
  } catch (err) {
    console.error("getUpdates error:", err.message);
    await new Promise((r) => setTimeout(r, 3000));
    continue;
  }

  for (const u of updates) {
    offset = u.update_id + 1;
    try {
      if (u.message) await handleMessage(auth, u.message, store, { onSeen });
      else if (u.callback_query) await handleCallback(auth, u.callback_query, store);
    } catch (err) {
      console.error("update handler error:", err.message);
    }
  }
}
