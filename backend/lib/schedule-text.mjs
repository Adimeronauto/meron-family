// Compact Hebrew rendering of a schedule, for feeding Claude as question context.

import { TIMEZONE } from "../config/rules.mjs";

const dayFmt = new Intl.DateTimeFormat("he-IL", {
  weekday: "long", day: "numeric", month: "numeric", timeZone: TIMEZONE,
});
const timeFmt = new Intl.DateTimeFormat("he-IL", {
  hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE,
});

const OWNER_HE = { amit: "עמית", nadav: "נדב", both: "עמית ונדב" };

/** items → grouped-by-day Hebrew text. Filters to the given owner keys (plus "both"). */
export function scheduleToText(items, ownerKeys) {
  const relevant = items.filter((i) => ownerKeys.includes(i.owner) || i.owner === "both");
  if (!relevant.length) return "(אין אירועים קרובים)";

  const lines = [];
  let lastDay = "";
  for (const i of relevant) {
    const day = dayFmt.format(i.startMs);
    if (day !== lastDay) {
      lines.push(`${day}:`);
      lastDay = day;
    }
    const time = i.allDay ? "כל היום" : timeFmt.format(i.startMs);
    const range = i.endMs ? `${time} עד ${timeFmt.format(i.endMs)}` : time;
    const tag = i.isTest ? " [מבחן]" : "";
    lines.push(`  ${range} ${i.title} (${OWNER_HE[i.owner]})${tag}`);
  }
  return lines.join("\n");
}
