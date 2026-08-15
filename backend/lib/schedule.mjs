// Fetches events from every included calendar over a time window, classifies them, and returns
// per-kid schedules. This is the core the phone sync, morning message, and week view all share.

import { google } from "googleapis";
import { CALENDARS } from "../config/routing.mjs";
import { classifyEvent } from "./classify.mjs";

/**
 * @param auth an authorized OAuth2 client
 * @param fromMs window start (default now)
 * @param toMs   window end (default now + 7 days)
 * @returns { amit: Item[], nadav: Item[], all: Item[] } sorted by start time
 */
export async function buildSchedule(auth, { fromMs = Date.now(), toMs = Date.now() + 7 * 864e5 } = {}) {
  const calendar = google.calendar({ version: "v3", auth });
  const timeMin = new Date(fromMs).toISOString();
  const timeMax = new Date(toMs).toISOString();

  // Events hidden from the board (e.g. a wrong/irrelevant test from a read-only school calendar)
  // are dropped right here, so every consumer — board, reminders, morning digest — is consistent.
  // Dynamic import + a soft fallback to "nothing hidden": db.mjs throws if DATABASE_URL isn't
  // set (true for local scripts like scripts/preview.mjs, which don't load .env), and a DB hiccup
  // here shouldn't take the whole board down with it.
  const hiddenIds = await (async () => {
    try {
      const { sql } = await import("./db.mjs");
      const { NeonHiddenEventsStore } = await import("./hidden-events-store.mjs");
      return await new NeonHiddenEventsStore(sql).listIds();
    } catch (err) {
      console.warn("hidden-events lookup skipped:", err.message);
      return new Set();
    }
  })();

  const all = [];

  for (const cal of CALENDARS) {
    let pageToken;
    do {
      const { data } = await calendar.events.list({
        calendarId: cal.id,
        timeMin,
        timeMax,
        singleEvents: true, // expand recurring events into instances
        orderBy: "startTime",
        maxResults: 250,
        pageToken,
      });

      for (const event of data.items ?? []) {
        if (event.status === "cancelled") continue;
        if (hiddenIds.has(event.id)) continue;
        const item = classifyEvent(cal, event);
        if (item) all.push(item);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  }

  all.sort((a, b) => a.startMs - b.startMs);

  const forKid = (kid) => all.filter((i) => i.owner === kid || i.owner === "both");

  return {
    amit: forKid("amit"),
    nadav: forKid("nadav"),
    all,
  };
}
