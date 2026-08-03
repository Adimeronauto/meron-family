// Register / inspect / remove the Telegram webhook.
//   node scripts/set-webhook.mjs info
//   node scripts/set-webhook.mjs set https://<app>.vercel.app/api/telegram <secret>
//   node scripts/set-webhook.mjs delete
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV = path.resolve(__dirname, "..", ".env");
if (!process.env.TELEGRAM_BOT_TOKEN && existsSync(ENV)) process.loadEnvFile(ENV);
const token = process.env.TELEGRAM_BOT_TOKEN;
const api = (m) => `https://api.telegram.org/bot${token}/${m}`;

const [cmd, url, secret] = process.argv.slice(2);

async function call(method, body) {
  const res = await fetch(api(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
}

if (cmd === "info") {
  console.log(JSON.stringify(await call("getWebhookInfo"), null, 2));
} else if (cmd === "set") {
  if (!url) throw new Error("usage: set <url> [secret]");
  const sec = secret || process.env.TELEGRAM_WEBHOOK_SECRET;
  const body = { url, allowed_updates: ["message", "callback_query"], drop_pending_updates: true };
  if (sec) body.secret_token = sec;
  console.log(JSON.stringify(await call("setWebhook", body), null, 2));
} else if (cmd === "delete") {
  console.log(JSON.stringify(await call("deleteWebhook", { drop_pending_updates: false }), null, 2));
} else {
  console.log("commands: info | set <url> [secret] | delete");
}
