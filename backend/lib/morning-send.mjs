// Builds and sends the 07:30 summary to every configured family member.
// Used by the Vercel cron endpoint and by a local test script.

import { buildSchedule } from "./schedule.mjs";
import { buildKidMessage, buildParentMessage } from "./morning.mjs";
import { sendMessage } from "./telegram.mjs";
import { TELEGRAM_PEOPLE } from "../config/people-telegram.mjs";

/**
 * @returns a per-recipient report: [{ chatId, role, sent: boolean }]
 */
export async function sendMorningToAll(auth) {
  const schedule = await buildSchedule(auth);
  const report = [];

  for (const [chatId, person] of Object.entries(TELEGRAM_PEOPLE)) {
    let text;
    if (person.role === "parent") text = buildParentMessage(schedule);
    else if (person.role === "amit") text = buildKidMessage("עמית", schedule.amit);
    else if (person.role === "nadav") text = buildKidMessage("נדב", schedule.nadav);

    if (!text) {
      report.push({ chatId, role: person.role, sent: false }); // nothing today — stay silent
      continue;
    }
    try {
      await sendMessage(Number(chatId), text);
      report.push({ chatId, role: person.role, sent: true });
    } catch (err) {
      console.error(`morning send to ${chatId} failed:`, err.message);
      report.push({ chatId, role: person.role, sent: false, error: err.message });
    }
  }
  return report;
}
