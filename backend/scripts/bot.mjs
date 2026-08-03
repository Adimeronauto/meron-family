// Local polling bot — for development/testing. Production runs the same handlers via the Vercel
// webhook (api/telegram.mjs). Run: npm run bot

import { appendFileSync } from "node:fs";
import { getClient } from "../lib/google-auth.mjs";
import { getUpdates, getMe } from "../lib/telegram.mjs";
import { handleMessage, handleCallback } from "../lib/handlers.mjs";
import { MemoryStore } from "../lib/pending-store.mjs";
import { MemoryTaskStore } from "../lib/task-store.mjs";

const auth = await getClient();
const store = new MemoryStore();
const tasks = new MemoryTaskStore();
const me = await getMe();
console.log(`הבוט @${me.username} פועל. Ctrl+C לעצירה.\n`);

// Setup aid: record each sender's chat id so new family members can be found and added.
const onSeen = (chatId, name, text) => {
  console.log(`[msg] chatId=${chatId} (${name}): ${text}`);
  try {
    appendFileSync("seen-chats.log", `${chatId}\t${name}\t${text}\n`);
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
      if (u.message) await handleMessage(auth, u.message, store, { onSeen, tasks });
      else if (u.callback_query) await handleCallback(auth, u.callback_query, store, { tasks });
    } catch (err) {
      console.error("update handler error:", err.message);
    }
  }
}
