// Permanently-hidden calendar events. For a test/homework item that came from a read-only school
// calendar (no edit access at the source, and the bot's delete/change commands only touch the
// family calendar it writes to — see handlers.mjs), this is the only way to remove it: hide it by
// event id, everywhere the schedule engine is used (day/week/month, the tests list, overlay
// reminders, the morning digest). Permanent by design — no unhide UI for now.

export class NeonHiddenEventsStore {
  #sql;
  #ready;

  constructor(sql) {
    this.#sql = sql;
    this.#ready = this.#init();
  }

  async #init() {
    await this.#sql`
      CREATE TABLE IF NOT EXISTS hidden_events (
        id TEXT PRIMARY KEY,
        hidden_by TEXT,
        hidden_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
  }

  /** All currently-hidden event ids, as a Set for cheap membership checks while filtering. */
  async listIds() {
    await this.#ready;
    const rows = await this.#sql`SELECT id FROM hidden_events`;
    return new Set(rows.map((r) => r.id));
  }

  /** Hide one event. Idempotent — hiding an already-hidden id is a no-op. */
  async hide(id, hiddenBy) {
    await this.#ready;
    await this.#sql`
      INSERT INTO hidden_events (id, hidden_by) VALUES (${id}, ${hiddenBy ?? null})
      ON CONFLICT (id) DO NOTHING`;
  }
}
