// Shared Google OAuth helper.
//
// Reads the Desktop-app credentials, runs a one-time loopback consent flow, and caches the
// refresh token to google-token.json. Every later run reuses that token silently — the browser
// only opens once. Because the app is published to production, the refresh token is durable
// (it would expire every 7 days if the app were still in "Testing").

import { google } from "googleapis";
import http from "node:http";
import { URL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const CREDENTIALS_PATH = path.join(ROOT, "google-credentials.json");
const TOKEN_PATH = path.join(ROOT, "google-token.json");

// readonly: list calendars and read events across all of them.
// events: write lessons to the Meron Family calendar from Telegram.
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

async function loadCredentials() {
  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error(`Missing ${CREDENTIALS_PATH} — download the OAuth client JSON first.`);
  }
  const raw = JSON.parse(await readFile(CREDENTIALS_PATH, "utf8"));
  const cfg = raw.installed ?? raw.web;
  if (!cfg) throw new Error("Credentials JSON is not a Desktop-app client.");
  return cfg;
}

function makeClient(cfg, redirectUri) {
  return new google.auth.OAuth2(cfg.client_id, cfg.client_secret, redirectUri);
}

/** Interactive: opens the browser, waits for the redirect, saves the token. */
export async function authorizeInteractive() {
  const cfg = await loadCredentials();

  // Bind an ephemeral loopback port and use it as the redirect target.
  const { server, port, firstRequest } = await startLoopbackServer();
  const redirectUri = `http://127.0.0.1:${port}`;
  const client = makeClient(cfg, redirectUri);

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force a refresh_token even on re-auth
    scope: SCOPES,
  });

  console.log("\nפותח את הדפדפן לאישור חד-פעמי...");
  console.log("אם הדפדפן לא נפתח, פתחו ידנית את הכתובת:\n");
  console.log(authUrl + "\n");
  openBrowser(authUrl);

  const code = await firstRequest;
  server.close();

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh_token returned. Revoke prior access at " +
        "https://myaccount.google.com/permissions and run auth again."
    );
  }

  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf8");
  console.log(`\n✓ Token saved to ${TOKEN_PATH}`);
  return client;
}

/**
 * Non-interactive client. Two credential sources:
 *   - Cloud (Vercel): GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN env vars.
 *   - Local: google-credentials.json + google-token.json on disk (from `npm run auth`).
 * The refresh token is durable because the OAuth app is published to production.
 */
export async function getClient() {
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "http://127.0.0.1",
    );
    client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return client;
  }

  const cfg = await loadCredentials();
  if (!existsSync(TOKEN_PATH)) {
    throw new Error("No google-token.json yet — run `npm run auth` once first.");
  }
  const tokens = JSON.parse(await readFile(TOKEN_PATH, "utf8"));
  const client = makeClient(cfg, "http://127.0.0.1");
  client.setCredentials(tokens);

  // Persist any rotated tokens so we never silently fall back to a stale one.
  client.on("tokens", async (fresh) => {
    const merged = { ...tokens, ...fresh };
    await writeFile(TOKEN_PATH, JSON.stringify(merged, null, 2), "utf8");
  });

  return client;
}

function startLoopbackServer() {
  return new Promise((resolve) => {
    let resolveRequest;
    const firstRequest = new Promise((r) => (resolveRequest = r));

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (code) {
        res.end("<html dir='rtl'><body style='font-family:sans-serif;text-align:center;padding-top:60px'><h2>הצליח ✓</h2><p>אפשר לסגור את החלון ולחזור לטרמינל.</p></body></html>");
        resolveRequest(code);
      } else {
        res.end(`<html dir='rtl'><body style='font-family:sans-serif;text-align:center;padding-top:60px'><h2>שגיאה</h2><p>${error ?? "unknown"}</p></body></html>`);
      }
    });

    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port, firstRequest });
    });
  });
}

function openBrowser(url) {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, { shell: true }, () => {});
}
