// Overlay-reminder feed for the phone app (Vercel). GET /api/reminders?t=<token> → the small,
// near-term list of overlay-eligible events a kid's phone should arm alarms for.
//
// Deliberately lean and short-windowed compared to /api/board (which serves the human-facing
// week/month browsing UI over a 150-day range): this is polled every ~20 minutes by the Android
// app, so the payload stays small and the Google Calendar fetch stays fast. Token-gated with the
// same durable per-kid token used for the web board — no separate auth system.

import { getClient } from "../lib/google-auth.mjs";
import { buildSchedule } from "../lib/schedule.mjs";
import { verify } from "../lib/board-token.mjs";

export const config = { maxDuration: 30 };

const WINDOW_MS = 48 * 3600e3;

export default async function handler(req, res) {
  const kid = verify(req.query?.t);
  if (!kid) return res.status(401).json({ ok: false, error: "bad token" });

  try {
    const now = Date.now();
    const auth = await getClient();
    const schedule = await buildSchedule(auth, { fromMs: now, toMs: now + WINDOW_MS });

    const list = kid === "both" ? schedule.all : schedule[kid];
    const reminders = list
      .filter((i) => i.overlayEligible && i.startMs > now)
      .map((i) => ({
        id: i.id,
        title: i.title,
        startMs: i.startMs,
        reminderAtMs: i.reminderAtMs,
        noSnoozeAfterMinutes: i.noSnoozeAfterMinutes,
      }));

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, kid, nowMs: now, reminders });
  } catch (err) {
    console.error("reminders error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
