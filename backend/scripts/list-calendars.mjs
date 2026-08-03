// Lists every calendar the account can see, so we can confirm Meron Family and the five school
// calendars are visible and decide how each maps to a kid.
import { google } from "googleapis";
import { getClient } from "../lib/google-auth.mjs";

const auth = await getClient();
const calendar = google.calendar({ version: "v3", auth });

const { data } = await calendar.calendarList.list({ maxResults: 250, showHidden: true });
const items = data.items ?? [];

console.log(`\nנמצאו ${items.length} לוחות שנה:\n`);
console.log("─".repeat(70));

for (const cal of items) {
  const writable = cal.accessRole === "owner" || cal.accessRole === "writer";
  console.log(`${cal.summary}`);
  console.log(`   id:      ${cal.id}`);
  console.log(`   access:  ${cal.accessRole}${writable ? "  (ניתן לכתיבה)" : "  (קריאה בלבד)"}`);
  if (cal.primary) console.log("   primary: כן");
  console.log("─".repeat(70));
}

const writableCount = items.filter(
  (c) => c.accessRole === "owner" || c.accessRole === "writer"
).length;
console.log(`\nמתוכם ${writableCount} ניתנים לכתיבה (לשם יכתוב הבוט שיעורים).`);
