// Prints the durable dashboard link for each person. The token in the link is meant to be shared
// (that is how a kid opens their board) — but it is signed with WEEKVIEW_SECRET, which stays in
// .env and is never printed. Usage: node scripts/board-links.mjs [baseUrl]

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV = path.resolve(__dirname, "..", ".env");
if (!process.env.WEEKVIEW_SECRET && existsSync(ENV)) process.loadEnvFile(ENV);

const { sign, verify, personName } = await import("../lib/board-token.mjs");

const base = (process.argv[2] || "https://meron-family.vercel.app").replace(/\/+$/, "");

for (const kid of ["amit", "nadav", "both"]) {
  const token = sign(kid);
  if (verify(token) !== kid) throw new Error(`self-check failed for ${kid}`);
  const label = kid === "both" ? "עדי (הורה — שני הילדים)" : personName(kid);
  console.log(`${label}:\n  ${base}/w/?t=${token}\n`);
}
console.log("✓ all tokens verified");
