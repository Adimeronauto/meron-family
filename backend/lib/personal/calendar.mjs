// Reads and writes Adi's own calendar directly — no per-kid routing, no name-prefix rewriting,
// unlike lib/calendar-write.mjs (the family bot). Just plain events on one calendar.

import { google } from "googleapis";
import { PERSONAL_CALENDAR_ID } from "../../config/personal.mjs";
import { TIMEZONE } from "../../config/rules.mjs";
import { msToWall, addMinutesWall } from "../calendar-write.mjs";

export { msToWall };

/**
 * @param auth authorized OAuth2 client
 * @returns normalized items, sorted by start time
 */
export async function listEvents(auth, { fromMs = Date.now(), toMs = Date.now() + 400 * 864e5 } = {}) {
  const calendar = google.calendar({ version: "v3", auth });
  const timeMin = new Date(fromMs).toISOString();
  const timeMax = new Date(toMs).toISOString();

  const all = [];
  let pageToken;
  do {
    const { data } = await calendar.events.list({
      calendarId: PERSONAL_CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true, // expand recurring events into instances
      orderBy: "startTime",
      maxResults: 250,
      pageToken,
    });

    for (const event of data.items ?? []) {
      if (event.status === "cancelled") continue;
      const item = normalize(event);
      if (item) all.push(item);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  all.sort((a, b) => a.startMs - b.startMs);
  return all;
}

function normalize(event) {
  const startMs = eventStartMs(event);
  if (startMs == null) return null;
  return {
    id: event.id,
    title: event.summary ?? "(ללא כותרת)",
    location: event.location || "",
    startMs,
    endMs: eventEndMs(event),
    allDay: Boolean(event.start?.date && !event.start?.dateTime),
  };
}

function eventStartMs(event) {
  if (event.start?.dateTime) return new Date(event.start.dateTime).getTime();
  if (event.start?.date) return new Date(`${event.start.date}T00:00:00`).getTime();
  return null;
}

function eventEndMs(event) {
  if (event.end?.dateTime) return new Date(event.end.dateTime).getTime();
  return null;
}

/**
 * @param ev { title, date (YYYY-MM-DD), startTime (HH:MM, empty for all-day), durationMinutes, location? }
 * @returns the created event (id, htmlLink)
 */
export async function createEvent(auth, ev) {
  const calendar = google.calendar({ version: "v3", auth });
  const requestBody = { summary: ev.title, location: ev.location || undefined };

  if (ev.allDay || !ev.startTime) {
    requestBody.start = { date: ev.date };
    requestBody.end = { date: nextDay(ev.date) };
  } else {
    requestBody.start = { dateTime: `${ev.date}T${pad(ev.startTime)}:00`, timeZone: TIMEZONE };
    requestBody.end = {
      dateTime: addMinutesWall(ev.date, ev.startTime, ev.durationMinutes || 60),
      timeZone: TIMEZONE,
    };
  }

  const { data } = await calendar.events.insert({ calendarId: PERSONAL_CALENDAR_ID, requestBody });
  return data;
}

/**
 * @param opts { date, startTime, durationMinutes, allDay, title?, location? } — only the fields
 *   that changed need to be set; date/startTime/durationMinutes are required to rebuild start/end.
 */
export async function updateEvent(auth, eventId, opts) {
  const calendar = google.calendar({ version: "v3", auth });
  const requestBody = {};

  if (opts.allDay) {
    requestBody.start = { date: opts.date };
    requestBody.end = { date: nextDay(opts.date) };
  } else if (opts.date && opts.startTime) {
    requestBody.start = { dateTime: `${opts.date}T${pad(opts.startTime)}:00`, timeZone: TIMEZONE };
    requestBody.end = {
      dateTime: addMinutesWall(opts.date, opts.startTime, opts.durationMinutes || 60),
      timeZone: TIMEZONE,
    };
  }
  if (opts.title) requestBody.summary = opts.title;
  if (opts.location) requestBody.location = opts.location;

  const { data } = await calendar.events.patch({ calendarId: PERSONAL_CALENDAR_ID, eventId, requestBody });
  return data;
}

export async function deleteEvent(auth, eventId) {
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({ calendarId: PERSONAL_CALENDAR_ID, eventId });
}

function pad(hhmm) {
  const [h, m] = String(hhmm).split(":");
  return `${String(h).padStart(2, "0")}:${String(m ?? "00").padStart(2, "0")}`;
}

function nextDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
