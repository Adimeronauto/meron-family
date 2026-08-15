// Dashboard data (Vercel). GET /api/board?t=<token> → the person's events for the visible window
// plus their open tasks. Read-only. Token-gated: a kid's token only ever returns their own scope.

import { getClient } from "../lib/google-auth.mjs";
import { buildSchedule } from "../lib/schedule.mjs";
import { verify, ownersFor, personName } from "../lib/board-token.mjs";
import { NeonTaskStore } from "../lib/task-store.mjs";
import { sql } from "../lib/db.mjs";
import { TIMEZONE } from "../config/rules.mjs";

export const config = { maxDuration: 30 };

const DAY = 864e5;

export default async function handler(req, res) {
  const kid = verify(req.query?.t);
  if (!kid) return res.status(401).json({ ok: false, error: "bad token" });

  try {
    const now = Date.now();
    const auth = await getClient();
    // A generous window so the day, week and month navigation have data without paging. 365 days
    // forward — schools publish a full year's worth of mock-exam/activity dates at once, and a
    // shorter window (previously 150 days) silently made those later events vanish from the app
    // even though the month view lets you keep flipping forward indefinitely.
    const schedule = await buildSchedule(auth, { fromMs: now - 31 * DAY, toMs: now + 365 * DAY });

    const list = kid === "both" ? schedule.all : schedule[kid];
    const events = list.map((i) => ({
      id: i.id,
      title: i.title,
      owner: i.owner,
      startMs: i.startMs,
      endMs: i.endMs,
      isTest: i.isTest,
      examLabel: i.examLabel,
      allDay: i.allDay,
    }));

    const store = new NeonTaskStore(sql);
    const owners = kid === "both" ? ["amit", "nadav"] : [kid];
    const per = await Promise.all(owners.map((o) => store.listWithDone(o)));
    const shape = (t) => ({ id: t.id, owner: t.owner, title: t.title });
    const tasks = { open: [], done: [] };
    for (const r of per) { tasks.open.push(...r.open.map(shape)); tasks.done.push(...r.done.map(shape)); }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ok: true, kid, name: personName(kid), tz: TIMEZONE, nowMs: now, events, tasks,
    });
  } catch (err) {
    console.error("board error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
