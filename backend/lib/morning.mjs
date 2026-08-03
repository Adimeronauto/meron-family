// Builds the 07:30 Hebrew summary text from a schedule.
//
// Two shapes: a per-kid message (their own day) and a parent message (both kids). Tests in the
// next week are shown with a day countdown regardless of whose message it is.

import { TIMEZONE } from "../config/rules.mjs";

const timeFmt = new Intl.DateTimeFormat("he-IL", {
  hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE,
});
const weekdayFmt = new Intl.DateTimeFormat("he-IL", { weekday: "long", timeZone: TIMEZONE });

const DAY_MS = 864e5;

/** Local Y-M-D key for grouping "today", timezone-aware. */
function dayKey(ms) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: TIMEZONE,
  }).format(ms);
}

function daysUntil(ms, now) {
  return Math.round((new Date(dayKey(ms)) - new Date(dayKey(now))) / DAY_MS);
}

function todaysActivities(items, now) {
  const key = dayKey(now);
  return items.filter(
    (i) => !i.isTest && !i.allDay && dayKey(i.startMs) === key
  );
}

function upcomingTests(items, now, withinDays = 7) {
  const seen = new Set();
  return items
    .filter((i) => i.isTest)
    .map((i) => ({ ...i, days: daysUntil(i.startMs, now) }))
    .filter((i) => i.days >= 0 && i.days <= withinDays)
    .filter((i) => {
      const k = i.id + i.owner;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.days - b.days);
}

function testLine(t) {
  const when = t.days === 0 ? "היום" : t.days === 1 ? "מחר" : `בעוד ${t.days} ימים`;
  return `⚠️ ${t.title} — ${when}`;
}

function timeRange(item) {
  const start = timeFmt.format(item.startMs);
  if (!item.endMs || item.endMs <= item.startMs) return start;
  // "עד" (a strong RTL char) anchors the two times in the correct order — a bare dash between
  // two LTR clock times gets flipped by the bidi algorithm in an RTL message.
  return `${start} עד ${timeFmt.format(item.endMs)}`;
}

function activityLines(items) {
  return items.map((i) => `  ${timeRange(i)}  ${i.title}`);
}

/**
 * Message for one kid: their day plus their upcoming tests.
 * Returns null when there is nothing worth sending (no events today and no upcoming test) —
 * the bot then sends nothing at all rather than an "אין אירועים" message.
 */
export function buildKidMessage(name, items, now = Date.now()) {
  const today = todaysActivities(items, now);
  const tests = upcomingTests(items, now);
  if (!today.length && !tests.length) return null;

  const weekday = weekdayFmt.format(now);
  const lines = [`<b>בוקר טוב ${name}!</b>`, `היום — ${weekday}:`];

  if (today.length) lines.push(...activityLines(today));
  else lines.push("  אין אירועים קבועים היום");

  if (tests.length) {
    lines.push("");
    lines.push(...tests.map(testLine));
  }

  return lines.join("\n");
}

/**
 * Message for a parent: both kids grouped, plus all upcoming tests.
 * Returns null when neither kid has events today and there are no upcoming tests.
 */
export function buildParentMessage(schedule, now = Date.now()) {
  const amitToday = todaysActivities(schedule.amit, now);
  const nadavToday = todaysActivities(schedule.nadav, now);
  const tests = upcomingTests(schedule.all, now);
  if (!amitToday.length && !nadavToday.length && !tests.length) return null;

  const weekday = weekdayFmt.format(now);
  const lines = [`<b>בוקר טוב!</b> ${weekday}`];

  for (const [name, today] of [["עמית", amitToday], ["נדב", nadavToday]]) {
    lines.push("");
    lines.push(`<b>${name}:</b>`);
    if (today.length) lines.push(...activityLines(today));
    else lines.push("  אין אירועים היום");
  }

  if (tests.length) {
    lines.push("");
    lines.push("<b>מבחנים קרובים:</b>");
    lines.push(...tests.map(testLine));
  }

  return lines.join("\n");
}
