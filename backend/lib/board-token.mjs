// Stateless per-person dashboard tokens.
//
// A dashboard link is `/w/?t=<token>` where the token names the person (amit / nadav / both) and
// is HMAC-signed with WEEKVIEW_SECRET. No database lookup and no expiry — the link is durable, so
// it can be added to the home screen once and keep working. The signature is the whole security:
// without the secret you can't forge a token, and a kid's token only ever grants their own scope.

import { createHmac, timingSafeEqual } from "node:crypto";

const KIDS = new Set(["amit", "nadav", "both"]);

const NAME = { amit: "עמית", nadav: "נדב", both: "עמית ונדב" };
export const personName = (kid) => NAME[kid] ?? kid;

/** Which owners a token may see: a kid sees their own + family; "both" sees everyone. */
export function ownersFor(kid) {
  if (kid === "both") return ["amit", "nadav", "both"];
  return [kid, "both"];
}

function secret() {
  const s = process.env.WEEKVIEW_SECRET;
  if (!s) throw new Error("WEEKVIEW_SECRET missing — set it in .env and the Vercel env.");
  return s;
}

function sig(kid) {
  return createHmac("sha256", secret()).update(kid).digest("base64url");
}

/** Build a token for a person. */
export function sign(kid) {
  if (!KIDS.has(kid)) throw new Error(`unknown person: ${kid}`);
  return `${kid}.${sig(kid)}`;
}

/** Verify a token → the person string, or null if missing/tampered. */
export function verify(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [kid, given] = token.split(".");
  if (!KIDS.has(kid)) return null;
  const expected = sig(kid);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? kid : null;
}
