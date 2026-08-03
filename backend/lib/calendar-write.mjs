// Writes lessons to the Meron Family calendar. The person's name is put in the title so the
// same routing rules that read events also apply to ones the bot creates.

import { google } from "googleapis";
import { WRITE_CALENDAR_ID } from "../config/routing.mjs";
import { TIMEZONE } from "../config/rules.mjs";

const NAME_PREFIX = { amit: "עמית", nadav: "נדב", both: "עמית ונדב" };

/**
 * @param auth authorized OAuth2 client
 * @param lesson { person, title, date (YYYY-MM-DD), startTime (HH:MM), durationMinutes }
 * @returns the created event (id, htmlLink)
 */
export async function createLesson(auth, lesson) {
  const calendar = google.calendar({ version: "v3", auth });

  const prefix = NAME_PREFIX[lesson.person] ?? NAME_PREFIX.both;
  const summary = `${prefix}: ${lesson.title}`.trim();

  const startWall = `${lesson.date}T${pad(lesson.startTime)}:00`;
  const endWall = addMinutesWall(lesson.date, lesson.startTime, lesson.durationMinutes || 60);

  const { data } = await calendar.events.insert({
    calendarId: WRITE_CALENDAR_ID,
    requestBody: {
      summary,
      // dateTime without offset + timeZone lets Google resolve the wall-clock (handles DST).
      start: { dateTime: startWall, timeZone: TIMEZONE },
      end: { dateTime: endWall, timeZone: TIMEZONE },
      description: "נוצר על ידי בוט המשפחה",
    },
  });

  return data;
}

/** Move/retime an existing lesson. Only the date/time change; the title is left as-is. */
export async function updateLesson(auth, eventId, { date, startTime, durationMinutes }) {
  const calendar = google.calendar({ version: "v3", auth });
  const startWall = `${date}T${pad(startTime)}:00`;
  const endWall = addMinutesWall(date, startTime, durationMinutes || 60);
  const { data } = await calendar.events.patch({
    calendarId: WRITE_CALENDAR_ID,
    eventId,
    requestBody: {
      start: { dateTime: startWall, timeZone: TIMEZONE },
      end: { dateTime: endWall, timeZone: TIMEZONE },
    },
  });
  return data;
}

export async function deleteLesson(auth, eventId) {
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({ calendarId: WRITE_CALENDAR_ID, eventId });
}

/** Wall-clock date (YYYY-MM-DD) and time (HH:MM) for a timestamp, in the app timezone. */
export function msToWall(ms) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIMEZONE,
  }).formatToParts(ms).reduce((o, p) => ((o[p.type] = p.value), o), {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function pad(hhmm) {
  const [h, m] = String(hhmm).split(":");
  return `${String(h).padStart(2, "0")}:${String(m ?? "00").padStart(2, "0")}`;
}

/** Add minutes to a naive wall-clock time and return "YYYY-MM-DDTHH:MM:00". */
function addMinutesWall(date, startTime, minutes) {
  // Treat as UTC purely for arithmetic — we only need the resulting wall-clock digits.
  const base = new Date(`${date}T${pad(startTime)}:00Z`);
  const end = new Date(base.getTime() + minutes * 60_000);
  const iso = end.toISOString(); // YYYY-MM-DDTHH:MM:SS.sssZ
  return iso.slice(0, 16) + ":00";
}
