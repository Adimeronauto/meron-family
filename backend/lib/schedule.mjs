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
