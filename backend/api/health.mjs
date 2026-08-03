// Simple liveness check — confirms the deploy is up before wiring Telegram and cron.
export default function handler(req, res) {
  res.status(200).json({ ok: true, service: "meron-family", time: new Date().toISOString() });
}
