// Local test of the morning summary to everyone (same code the Vercel cron runs).
import { getClient } from "../lib/google-auth.mjs";
import { sendMorningToAll } from "../lib/morning-send.mjs";

const auth = await getClient();
const report = await sendMorningToAll(auth);
console.log("תוצאה:", JSON.stringify(report, null, 2));
