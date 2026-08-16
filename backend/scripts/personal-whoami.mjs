// Shows everyone who has messaged the personal bot, with their chat id. Message the bot anything
// once, then run this to read your chat id back and add it to PERSONAL_ALLOWED_CHAT_IDS in
// config/personal.mjs.
import { getUpdates, getMe } from "../lib/personal/telegram.mjs";

const me = await getMe();
console.log(`\nהבוט: @${me.username} (${me.first_name})\n`);

const updates = await getUpdates();
if (!updates.length) {
  console.log("עדיין אף אחד לא כתב לבוט.");
  console.log("פתחו את הבוט בטלגרם, לחצו Start או שלחו הודעה כלשהי, ואז הריצו שוב.\n");
}

const seen = new Map();
for (const u of updates) {
  const msg = u.message ?? u.edited_message;
  if (!msg?.from) continue;
  seen.set(msg.chat.id, {
    name: [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" "),
    username: msg.from.username ? "@" + msg.from.username : "—",
    chatId: msg.chat.id,
    lastText: msg.text ?? "",
  });
}

console.log(`נמצאו ${seen.size} אנשים:\n`);
for (const p of seen.values()) {
  console.log(`  ${p.name}  (${p.username})`);
  console.log(`     chat id: ${p.chatId}`);
  console.log(`     כתב: "${p.lastText}"`);
  console.log("");
}
