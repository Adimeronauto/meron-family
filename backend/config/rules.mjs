// Editable rules: lead times and test detection.
//
// Kept as plain data so they can move to the database later (the bot will edit them from
// Telegram) without touching the engine.

// Lead time per activity, matched by keyword anywhere in the title. First match wins, so put
// more specific keywords first. Falls back to DEFAULT_LEAD_MINUTES.
export const LEAD_TIME_RULES = [
  { keyword: "שירה", minutes: 20 }, // שיעור עם שירה
  { keyword: "גיטרה", minutes: 20 }, // שיעור גיטרה
  { keyword: "דמינטון", minutes: 60 }, // matches both בדמינטון and the בנדמינטון spelling
];

export const DEFAULT_LEAD_MINUTES = 30;

// After this many minutes-before-start, the snooze button disappears and only "הבנתי" remains,
// so there is always a final non-postponable card. Default = half the lead time, min 5.
export function noSnoozeAfterMinutes(leadMinutes) {
  return Math.max(5, Math.round(leadMinutes / 2));
}

// A title containing any of these is a test: notifications 5 and 3 days before, no overlay.
export const TEST_KEYWORDS = ["מבחן", "בוחן", "מתכונת", "בגרות", "מבדק"];

// A title containing any of these is homework / an assignment — shown in the "מבחנים ומטלות"
// list with a due-date countdown, never an overlay. "הגשה" is labelled separately from "מטלה".
export const HOMEWORK_KEYWORDS = ["שיעורי בית", "שיעורי-בית", "מטלה", "הגשה", "עבודה", "תרגיל", "דוח", 'דו"ח'];
export const SUBMISSION_KEYWORDS = ["הגשה", "להגיש"];

// Amit's school calendar is mixed across grades/classes (his class is יוד / grade 10). An event
// whose title contains one of these is for another grade (יא=11, יב=12) or a class/activity the
// kids aren't in — drop it entirely. Applied to school calendars only, so bot-added family lessons
// are never affected. The two-letter grade tokens יא / יב are matched only at Hebrew-letter
// boundaries (never as a substring of a longer word like קריאה / כתיבה).
export const EXCLUDE_TITLE_KEYWORDS = ["יא", "יב", "כדורסל", "כיתות רקיע", "מחול", "אמנות"];

// Each kid's own class number within their grade — some school-calendar titles scope an event
// to specific classes, e.g. a single other class ("י10", not עמית's) or a list/range ("י3-י9,
// י11-י14", which does include his). Keyed by the Hebrew grade letter used in these titles (י =
// 10th grade, ז = 7th grade). See excludedByClass() in classify.mjs. Update the relevant number
// if either kid moves to a different class.
export const CLASS_NUMBERS = {
  י: 5, // עמית — כיתה י' 5
  ז: 1, // נדב — כיתה ז' 1
};

// Add this emoji anywhere in an event's title (right in Google Calendar, on any calendar) to
// silently skip its overlay reminder — the event still shows normally in the day/week/month
// views, it just won't interrupt a game. Handy for one-off events you don't want a phone alarm
// for (a doctor visit, a family dinner, etc.) without touching this file.
export const NO_REMINDER_MARKER = "🔕";

// Days before a test to send a heads-up.
export const TEST_ALERT_DAYS = [5, 3];

export const TIMEZONE = "Asia/Jerusalem";

// The 07:30 daily Telegram summary (backend/api/cron/morning.mjs) is triggered by an external
// pinger (cron-job.org), not by anything in this repo or Vercel's own cron — so there's no
// schedule to remove here. This flag is the actual on/off switch: false makes the endpoint
// reply "skipped" without sending anything, still cheap for the external pinger to hit. Flip
// back to true to resume it.
export const MORNING_DIGEST_ENABLED = false;
