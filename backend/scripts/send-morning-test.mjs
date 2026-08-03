// Sends a real morning summary to one chat id, for a given audience.
//   node scripts/send-morning-test.mjs <chatId> [amit|nadav|parent]
import { getClient } from "../lib/google-auth.mjs";
import { buildSchedule } from "../lib/schedule.mjs";
import { buildKidMessage, buildParentMessage } from "../lib/morning.mjs";
import { sendMessage } from "../lib/telegram.mjs";

const chatId = process.argv[2];
const audience = process.argv[3] ?? "parent";
if (!chatId) {
  console.error("שימוש: node scripts/send-morning-test.mjs <chatId> [amit|nadav|parent]");
  process.exit(1);
}

const auth = await getClient();
const schedule = await buildSchedule(auth);

let text;
if (audience === "amit") text = buildKidMessage("עמית", schedule.amit);
else if (audience === "nadav") text = buildKidMessage("נדב", schedule.nadav);
else text = buildParentMessage(schedule);

if (!text) {
  console.log("אין אירועים היום — לא נשלחת הודעה.");
} else {
  console.log("שולח:\n");
  console.log(text.replace(/<\/?b>/g, ""));
  console.log("");
  await sendMessage(chatId, text);
  console.log("✓ נשלח.");
}
