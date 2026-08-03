// Runs the Vercel CLI with VERCEL_TOKEN loaded from .env, so the token is never on a command
// line. Usage: node scripts/vx.mjs <vercel args...>
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV = path.resolve(__dirname, "..", ".env");
if (existsSync(ENV)) process.loadEnvFile(ENV);

if (!process.env.VERCEL_TOKEN) {
  console.error("VERCEL_TOKEN missing in .env");
  process.exit(1);
}

const r = spawnSync("vercel", process.argv.slice(2), {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(r.status ?? 1);
