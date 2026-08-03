// Pushes all runtime secrets to the linked Vercel project (production env).
// Reads values from .env and the Google credential files; never prints values.
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(__dirname, "..");
const ROOT = path.resolve(BACKEND, "..");
const ENV = path.join(BACKEND, ".env");
if (existsSync(ENV)) process.loadEnvFile(ENV);

const creds = JSON.parse(readFileSync(path.join(ROOT, "google-credentials.json"), "utf8"));
const cfg = creds.installed ?? creds.web;
const tokenFile = JSON.parse(readFileSync(path.join(ROOT, "google-token.json"), "utf8"));

const vars = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  CRON_SECRET: process.env.CRON_SECRET,
  WEEKVIEW_SECRET: process.env.WEEKVIEW_SECRET,
  GOOGLE_CLIENT_ID: cfg.client_id,
  GOOGLE_CLIENT_SECRET: cfg.client_secret,
  GOOGLE_REFRESH_TOKEN: tokenFile.refresh_token,
};

const run = (args, input) =>
  spawnSync("vercel", args, { input, encoding: "utf8", shell: true, env: process.env });

for (const [name, value] of Object.entries(vars)) {
  if (!value) { console.log(`✗ ${name}: MISSING locally — skipped`); continue; }
  // Remove any existing value first (idempotent), then add.
  run(["env", "rm", name, "production", "--yes"]);
  const res = run(["env", "add", name, "production"], value);
  const ok = res.status === 0;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : "  " + (res.stderr || "").trim().split("\n").pop()}`);
}
console.log("done");
