// Neon Postgres connection (Vercel only). Local scripts don't import this.
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL missing — set it in the Vercel project env.");
}

export const sql = neon(process.env.DATABASE_URL);
