// Prints each kid's next 7 days as the engine sees it, so the routing and classification can be
// checked against reality before anything is built on top.

import { getClient } from "../lib/google-auth.mjs";
import { buildSchedule } from "../lib/schedule.mjs";
import { TIMEZONE } from "../config/rules.mjs";

const auth = await getClient();
const schedule = await buildSchedule(auth);

const dayFmt = new Intl.DateTimeFormat("he-IL", {
  weekday: "long", day: "numeric", month: "numeric", timeZone: TIMEZONE,
});
const timeFmt = new Intl.DateTimeFormat("he-IL", {
  hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE,
});

function printKid(name, items) {
  console.log("\n" + "═".repeat(64));
  console.log(`  ${name} — ${items.length} אירועים בשבוע הקרוב`);
  console.log("═".repeat(64));

  let lastDay = "";
  for (const item of items) {
    const day = dayFmt.format(item.startMs);
    if (day !== lastDay) {
      console.log(`\n  ${day}`);
      lastDay = day;
    }

    const time = item.allDay ? "כל היום" : timeFmt.format(item.startMs);
    const tags = [];
    if (item.isTest) tags.push("📝 מבחן");
    else if (item.overlayEligible) {
      tags.push(`⏰ תזכורת ${timeFmt.format(item.reminderAtMs)} (${item.leadMinutes}ד')`);
    }
    if (item.kind === "holidays") tags.push("🎉 חג");
    const tagStr = tags.length ? "   " + tags.join("  ") : "";

    console.log(`    ${time}  ${item.title}${tagStr}`);
    console.log(`           └─ [${item.calendarLabel}]`);
  }
}

printKid("עמית", schedule.amit);
printKid("נדב", schedule.nadav);

console.log("\n" + "─".repeat(64));
console.log(`סה"כ ${schedule.all.length} אירועים נקראו מכל הלוחות.\n`);
