// Turns a raw Google Calendar event + its source calendar into a normalized item:
// who it belongs to, whether it is a test or an activity, and (for activities) when to fire.

import {
  LEAD_TIME_RULES,
  DEFAULT_LEAD_MINUTES,
  noSnoozeAfterMinutes,
  TEST_KEYWORDS,
  HOMEWORK_KEYWORDS,
  SUBMISSION_KEYWORDS,
  EXCLUDE_TITLE_KEYWORDS,
} from "../config/rules.mjs";

// Match a keyword only when it stands as a whole token — a Hebrew-letter boundary on each side —
// so short grade markers (יא / יב) never match inside a longer word (קריאה, כתיבה, אביב).
const HEB = "\\u05d0-\\u05ea";
const EXCLUDE_RE = EXCLUDE_TITLE_KEYWORDS.map(
  (kw) => new RegExp(`(^|[^${HEB}])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^${HEB}])`)
);

/** True if a (school-calendar) title belongs to another grade/class and should be dropped. */
export function excludeByTitle(title) {
  const t = title ?? "";
  return EXCLUDE_RE.some((re) => re.test(t));
}

// Name detection for the personal calendar. Real titles are free-text with the name somewhere
// inside ("שיעור מתמטיקה עמית 1700"), sometimes both names ("נדב עמית אימון..."). No colon, no
// fixed position.
//
// NOTE: plain substring test, NOT \b word boundaries — JavaScript's \b is ASCII-only and never
// matches around Hebrew letters, which silently routed everything to "both".
const HAS_AMIT = /עמית|amit/i;
const HAS_NADAV = /נדב|nadav/i;
const HAS_FAMILY = /משפחה|family|כולם/i;

/** Resolve the owner of a single event given its source calendar's config. */
export function resolveOwner(calendar, title) {
  if (calendar.owner !== "prefix") return calendar.owner;

  const text = title ?? "";
  const amit = HAS_AMIT.test(text);
  const nadav = HAS_NADAV.test(text);

  // Explicit family word, or both kids named (a shared lesson) → both.
  if (HAS_FAMILY.test(text)) return "both";
  if (amit && nadav) return "both";
  if (amit) return "amit";
  if (nadav) return "nadav";

  // Unlabelled event on the family calendar → both kids (genuine family events are unlabelled).
  return "both";
}

export function isTest(title) {
  const text = title ?? "";
  return TEST_KEYWORDS.some((kw) => text.includes(kw));
}

export function isHomework(title) {
  const text = title ?? "";
  return HOMEWORK_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * The tag shown in the "מבחנים ומטלות" list, or null if the event doesn't belong there.
 * Tests win over homework (a "מבחן הגשה" is a test); "הגשה" is labelled as a submission.
 */
export function examLabelFor(title, test) {
  const text = title ?? "";
  if (test) return "מבחן";
  if (SUBMISSION_KEYWORDS.some((kw) => text.includes(kw))) return "הגשה";
  if (isHomework(text)) return "מטלה";
  return null;
}

export function leadMinutesFor(title) {
  const text = title ?? "";
  for (const rule of LEAD_TIME_RULES) {
    if (text.includes(rule.keyword)) return rule.minutes;
  }
  return DEFAULT_LEAD_MINUTES;
}

/**
 * Tidy a free-text title for display. Real titles carry the kid's name and the time inline
 * ("נדב אימון בדמינטון 18 עד 19:30"); the name is redundant once routed and the time is shown
 * separately, so strip both. Conservative — if cleaning would empty the title, keep the original.
 */
export function cleanTitle(title) {
  if (!title) return "";
  let t = title;

  // A leading "name prefix:" segment (e.g. "עמית ונדב: שיעור גיטרה") — drop it whole, including
  // the connector "ו" and the colon, when everything before the first colon is just names.
  t = t.replace(/^\s*(?:עמית|נדב|משפחה|amit|nadav|family|כולם|ו|and|,|\s)+:\s*/i, "");

  // Names (anywhere, not just a prefix) — they are redundant once the event is routed.
  t = t.replace(/\b(amit|nadav|family)\b/gi, " ");
  t = t.replace(/עמית|נדב|משפחה/g, " ");

  // Embedded times and ranges: "1700", "18:30", "18 עד 19:30", "עד", "1830 עד 2030".
  t = t.replace(/\b\d{1,2}:\d{2}\b/g, " "); // 18:30
  t = t.replace(/\b\d{3,4}\b/g, " "); // 1700, 1830
  t = t.replace(/(^|\s)עד(?=\s|$)/g, " "); // Hebrew-safe boundary; \b would not match here
  t = t.replace(/\b\d{1,2}\b/g, " "); // stray lone hours

  // Leftover separators and whitespace.
  t = t.replace(/^[\s:\-–,]+|[\s:\-–,]+$/g, "").replace(/\s{2,}/g, " ").trim();

  return t.length ? t : title.trim();
}

/**
 * Normalize one event. Returns null for all-day events with no clock time (holidays etc.) when
 * the calendar is not meant to produce timed reminders — the caller decides what to do with
 * those via the `kind` field.
 */
export function classifyEvent(calendar, event) {
  const rawTitle = event.summary ?? "(ללא כותרת)";
  // Drop other-grade / other-class events from the mixed school calendars.
  if (calendar.kind === "school" && excludeByTitle(rawTitle)) return null;
  const startMs = eventStartMs(event);
  if (startMs == null) return null;

  const owner = resolveOwner(calendar, rawTitle);
  const test = calendar.kind !== "holidays" && isTest(rawTitle);
  const examLabel = calendar.kind === "holidays" ? null : examLabelFor(rawTitle, test);
  const lead = leadMinutesFor(rawTitle);
  const endMs = eventEndMs(event);

  return {
    id: event.id,
    calendarId: calendar.id,
    calendarLabel: calendar.label,
    kind: calendar.kind,
    owner, // "amit" | "nadav" | "both"
    title: cleanTitle(rawTitle),
    rawTitle,
    startMs,
    endMs, // null for all-day; used to show a start–end range
    allDay: Boolean(event.start?.date && !event.start?.dateTime),
    isTest: test,
    examLabel, // "מבחן" | "מטלה" | "הגשה" | null — belongs in the tests/homework list when non-null
    // Reminder timing only applies to overlay-eligible, non-test, timed activities.
    overlayEligible: calendar.overlay && !test && !Boolean(event.start?.date && !event.start?.dateTime),
    leadMinutes: lead,
    reminderAtMs: startMs - lead * 60_000,
    noSnoozeAfterMinutes: noSnoozeAfterMinutes(lead),
  };
}

function eventStartMs(event) {
  if (event.start?.dateTime) return new Date(event.start.dateTime).getTime();
  if (event.start?.date) return new Date(event.start.date + "T00:00:00+03:00").getTime();
  return null;
}

function eventEndMs(event) {
  // Only meaningful for timed events; all-day "end.date" is exclusive and not a clock time.
  if (event.end?.dateTime) return new Date(event.end.dateTime).getTime();
  return null;
}
