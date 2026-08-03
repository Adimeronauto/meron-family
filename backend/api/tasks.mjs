// Task writes from the dashboard (Vercel). Token-gated; a token only ever mutates its own kid's
// tasks. "both" (the parent view) is read-only here — parents add tasks via Telegram instead.
//
//   POST   /api/tasks?t=<token>   { title }        → add
//   PATCH  /api/tasks?t=<token>   { id, done }      → mark done / undo
//   DELETE /api/tasks?t=<token>   { id }            → remove

import { verify } from "../lib/board-token.mjs";
import { NeonTaskStore } from "../lib/task-store.mjs";
import { sql } from "../lib/db.mjs";

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  const kid = verify(req.query?.t);
  if (!kid) return res.status(401).json({ ok: false, error: "bad token" });
  if (kid === "both") return res.status(403).json({ ok: false, error: "read-only view" });

  const store = new NeonTaskStore(sql);
  const body = typeof req.body === "string" ? safeParse(req.body) : req.body ?? {};

  try {
    if (req.method === "POST") {
      const title = (body.title ?? "").trim();
      if (!title) return res.status(400).json({ ok: false, error: "empty title" });
      if (title.length > 200) return res.status(400).json({ ok: false, error: "too long" });
      const row = await store.add(kid, title);
      return res.status(200).json({ ok: true, task: { id: row.id, owner: row.owner, title: row.title } });
    }

    if (req.method === "PATCH") {
      if (!body.id) return res.status(400).json({ ok: false, error: "missing id" });
      await store.setDone(body.id, kid, body.done !== false);
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const id = body.id ?? req.query?.id;
      if (!id) return res.status(400).json({ ok: false, error: "missing id" });
      await store.remove(id, kid);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "method not allowed" });
  } catch (err) {
    console.error("tasks error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
