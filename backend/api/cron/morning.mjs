// 07:30 morning summary (Vercel). Pinged by cron-job.org at exactly 07:30 Asia/Jerusalem.
// Protected by a shared secret so only the pinger can trigger it.

import { getClient } from "../../lib/google-auth.mjs";
import { sendMorningToAll } from "../../lib/morning-send.mjs";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const provided = req.query?.key ?? req.headers["x-cron-key"];
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const auth = await getClient();
    const report = await sendMorningToAll(auth);
    return res.status(200).json({ ok: true, report });
  } catch (err) {
    console.error("cron morning error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
