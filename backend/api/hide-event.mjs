// Permanently hides one calendar event from the whole board — day/week/month, the tests &
// homework list, overlay reminders, and the morning digest (see lib/hidden-events-store.mjs and
// its use in lib/schedule.mjs). Any valid board token may hide an event; hiding is global, not
// per-kid, since it means "this event is wrong/irrelevant" rather than a personal preference.
//
//   POST /api/hide-event?t=<token>   { id }

import { verify } from "../lib/board-token.mjs";
import { NeonHiddenEventsStore } from "../lib/hidden-events-store.mjs";
import { sql } from "../lib/db.mjs";

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  const kid = verify(req.query?.t);
  if (!kid) return res.status(401).json({ ok: false, error: "bad token" });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method not allowed" });

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body ?? {};
  const id = (body.id ?? "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "missing id" });

  try {
    await new NeonHiddenEventsStore(sql).hide(id, kid);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("hide-event error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
