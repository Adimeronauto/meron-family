// Per-kid task lists (a simple ongoing checklist, no dates).
//
// Same split as pending-store.mjs: an in-memory store for the retired local bot, and a Neon
// Postgres store for Vercel. Every mutating call is scoped by `owner` so a kid's dashboard token
// can only ever touch that kid's own tasks — never the sibling's.

import { randomBytes } from "node:crypto";

const newId = () => randomBytes(8).toString("hex");

/** In-memory store (local bot / tests). */
export class MemoryTaskStore {
  #rows = [];
  async list(owner) {
    return this.#rows
      .filter((t) => t.owner === owner && !t.done)
      .sort((a, b) => a.created_at - b.created_at);
  }
  async add(owner, title) {
    const row = { id: newId(), owner, title, done: false, created_at: Date.now() };
    this.#rows.push(row);
    return row;
  }
  async setDone(id, owner, done = true) {
    const row = this.#rows.find((t) => t.id === id && t.owner === owner);
    if (row) { row.done = done; row.done_at = done ? Date.now() : null; }
    return row ?? null;
  }
  async remove(id, owner) {
    const i = this.#rows.findIndex((t) => t.id === id && t.owner === owner);
    if (i >= 0) this.#rows.splice(i, 1);
  }
  async listWithDone(owner) {
    const open = this.#rows.filter((t) => t.owner === owner && !t.done)
      .sort((a, b) => a.created_at - b.created_at);
    const done = this.#rows.filter((t) => t.owner === owner && t.done)
      .sort((a, b) => (b.done_at || 0) - (a.done_at || 0)).slice(0, 25);
    return { open, done };
  }
}

/** Neon Postgres store for Vercel. Lazily creates its table. */
export class NeonTaskStore {
  #sql;
  #ready;

  constructor(sql) {
    this.#sql = sql;
    this.#ready = this.#init();
  }

  async #init() {
    await this.#sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        title TEXT NOT NULL,
        done BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        done_at TIMESTAMPTZ
      )`;
  }

  /** Open (not-done) tasks for one kid, oldest first. */
  async list(owner) {
    await this.#ready;
    return this.#sql`
      SELECT id, owner, title, done, extract(epoch from created_at) * 1000 AS created_at
      FROM tasks
      WHERE owner = ${owner} AND done = false
      ORDER BY created_at ASC`;
  }

  async add(owner, title) {
    await this.#ready;
    const id = newId();
    const rows = await this.#sql`
      INSERT INTO tasks (id, owner, title) VALUES (${id}, ${owner}, ${title})
      RETURNING id, owner, title, done, extract(epoch from created_at) * 1000 AS created_at`;
    return rows[0];
  }

  /** Mark done (scoped to owner). Kept in the table so a "completed today" count is possible later. */
  async setDone(id, owner, done = true) {
    await this.#ready;
    const rows = await this.#sql`
      UPDATE tasks
      SET done = ${done}, done_at = CASE WHEN ${done} THEN now() ELSE NULL END
      WHERE id = ${id} AND owner = ${owner}
      RETURNING id`;
    return rows[0] ?? null;
  }

  /** Hard delete (the "✗ / never mind" action), scoped to owner. */
  async remove(id, owner) {
    await this.#ready;
    await this.#sql`DELETE FROM tasks WHERE id = ${id} AND owner = ${owner}`;
  }

  /** Open tasks plus the most recently completed ones — for the dashboard's "בוצעו" section. */
  async listWithDone(owner) {
    await this.#ready;
    const open = await this.#sql`
      SELECT id, owner, title, done, extract(epoch from created_at) * 1000 AS created_at
      FROM tasks WHERE owner = ${owner} AND done = false ORDER BY created_at ASC`;
    const done = await this.#sql`
      SELECT id, owner, title, done, extract(epoch from created_at) * 1000 AS created_at
      FROM tasks WHERE owner = ${owner} AND done = true
      ORDER BY done_at DESC NULLS LAST LIMIT 25`;
    return { open, done };
  }
}
