// Task writes from the dashboard (Vercel). Token-gated.
//
// A kid's own token always acts as themself — body.owner is never trusted from a kid's token, so
// one kid's dashboard can never touch the sibling's tasks. The parent's "both" token instead must
// say explicitly which kid it's acting on (owner: "amit" | "nadav"), since it has no owner of its
// own — this is how the parent adds/checks/deletes either kid's tasks from the combined view.
//
//   POST   /api/tasks?t=<token>   { title, owner? }        → add
//   PATCH  /api/tasks?t=<token>   { id, done, owner? }      → mark done / undo
//   DELETE /api/tasks?t=<token>   { id, owner? }            → remove
//
// `owner` is required (and must be "amit"/"nadav") only when the token is "both"; ignored otherwise.

import { verify } from "../lib/board-token.mjs";
import { NeonTaskStore } from "../lib/task-store.mjs";
import { sql } from "../lib/db.mjs";

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  const kid = verify(req.query?.t);
  if (!kid) return res.status(401).json({ ok: false, error: "bad token" });

  const store = new NeonTaskStore(sql);
  const body = typeof req.body === "string" ? safeParse(req.body) : req.body ?? {};

  const owner = kid === "both" ? body.owner : kid;
  if (kid === "both" && owner !== "amit" && owner !== "nadav") {
    return res.status(400).json({ ok: false, error: "missing or invalid owner" });
  }

  try {
    if (req.method === "POST") {
      const title = (body.title ?? "").trim();
      if (!title) return res.status(400).json({ ok: false, error: "empty title" });
      if (title.length > 200) return res.status(400).json({ ok: false, error: "too long" });
      const row = await store.add(owner, title);
      return res.status(200).json({ ok: true, task: { id: row.id, owner: row.owner, title: row.title } });
    }

    if (req.method === "PATCH") {
      if (!body.id) return res.status(400).json({ ok: false, error: "missing id" });
      await store.setDone(body.id, owner, body.done !== false);
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const id = body.id ?? req.query?.id;
      if (!id) return res.status(400).json({ ok: false, error: "missing id" });
      await store.remove(id, owner);
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
