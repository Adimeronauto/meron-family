// Compact Hebrew rendering of a list of personal-calendar events, for feeding Claude as question
// context, and for showing candidate matches back to the user.

import { TIMEZONE } from "../../config/rules.mjs";

const dayFmt = new Intl.DateTimeFormat("he-IL", {
  weekday: "long", day: "numeric", month: "numeric", timeZone: TIMEZONE,
});
const timeFmt = new Intl.DateTimeFormat("he-IL", {
  hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE,
});
const dayTimeFmt = new Intl.DateTimeFormat("he-IL", {
  weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE,
});

/** items → grouped-by-day Hebrew text. */
export function eventsToText(items) {
  if (!items.length) return "(אין אירועים קרובים)";

  const lines = [];
  let lastDay = "";
  for (const i of items) {
    const day = dayFmt.format(i.startMs);
    if (day !== lastDay) {
      lines.push(`${day}:`);
      lastDay = day;
    }
    const time = i.allDay ? "כל היום" : timeFmt.format(i.startMs);
    const range = i.endMs && !i.allDay ? `${time} עד ${timeFmt.format(i.endMs)}` : time;
    const loc = i.location ? ` @ ${i.location}` : "";
    lines.push(`  ${range} ${i.title}${loc}`);
  }
  return lines.join("\n");
}

/** One event → a short single-line summary, for confirmation prompts and disambiguation lists. */
export function dayTime(ms) {
  return dayTimeFmt.format(ms);
}
