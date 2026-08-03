// Storage for pending ✅/❌ confirmations.
//
// Local polling bot: one long-lived process, so an in-memory Map is enough.
// Vercel: each request is a fresh, stateless invocation — the "add lesson" message and the
// button tap are different invocations, so the pending action must live in Postgres (Neon).

/** In-memory store for the local bot. */
export class MemoryStore {
  #map = new Map();
  async set(token, value) { this.#map.set(token, value); }
  async get(token) { return this.#map.get(token) ?? null; }
  async del(token) { this.#map.delete(token); }
}

/** Neon Postgres store for Vercel. Lazily creates its table; entries expire after 1 hour. */
export class NeonStore {
  #sql;
  #ready;

  constructor(sql) {
    this.#sql = sql;
    this.#ready = this.#init();
  }

  async #init() {
    await this.#sql`
      CREATE TABLE IF NOT EXISTS pending (
        token TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
  }

  async set(token, value) {
    await this.#ready;
    await this.#sql`INSERT INTO pending (token, data) VALUES (${token}, ${JSON.stringify(value)})`;
    // Opportunistic cleanup of anything older than an hour.
    await this.#sql`DELETE FROM pending WHERE created_at < now() - interval '1 hour'`;
  }

  async get(token) {
    await this.#ready;
    const rows = await this.#sql`
      SELECT data FROM pending
      WHERE token = ${token} AND created_at > now() - interval '1 hour'`;
    return rows[0]?.data ?? null;
  }

  async del(token) {
    await this.#ready;
    await this.#sql`DELETE FROM pending WHERE token = ${token}`;
  }
}
