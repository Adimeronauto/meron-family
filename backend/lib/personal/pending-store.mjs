// Storage for pending ✅/❌ confirmations for the personal-calendar bot.
//
// A separate Postgres table from the family bot's `pending` table (lib/pending-store.mjs) —
// same Neon database, kept apart so the two bots' confirmation tokens never collide or leak
// into each other's flow. The local dev bot can reuse the generic in-memory MemoryStore from
// lib/pending-store.mjs directly (it isn't family-specific).

export class NeonPersonalStore {
  #sql;
  #ready;

  constructor(sql) {
    this.#sql = sql;
    this.#ready = this.#init();
  }

  async #init() {
    await this.#sql`
      CREATE TABLE IF NOT EXISTS personal_pending (
        token TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
  }

  async set(token, value) {
    await this.#ready;
    await this.#sql`INSERT INTO personal_pending (token, data) VALUES (${token}, ${JSON.stringify(value)})`;
    // Opportunistic cleanup of anything older than an hour.
    await this.#sql`DELETE FROM personal_pending WHERE created_at < now() - interval '1 hour'`;
  }

  async get(token) {
    await this.#ready;
    const rows = await this.#sql`
      SELECT data FROM personal_pending
      WHERE token = ${token} AND created_at > now() - interval '1 hour'`;
    return rows[0]?.data ?? null;
  }

  async del(token) {
    await this.#ready;
    await this.#sql`DELETE FROM personal_pending WHERE token = ${token}`;
  }
}
