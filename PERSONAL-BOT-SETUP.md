# Personal calendar bot — setup

A second, separate Telegram bot that talks to your own calendar (`adi.meron1@gmail.com`), not
the kids' scheduling system. Different bot token, different Telegram conversation, different
confirmation-state table — it shares only the Google account credentials, the Anthropic key, and
the Neon database already configured for the family bot.

You can ask it things like:
- "מה יש לי מחר?" / "מתי הפגישה עם רואה החשבון?"
- "תוסיף לי פגישה עם דנה ביום שלישי ב-14:00"
- "תזיז את הפגישה עם רואה החשבון לשעה 16:00"
- "תמחק את הארוחה עם יוסי ביום חמישי"

Every add/change/delete goes through an inline ✅/❌ confirmation before anything is written.

## 1. Create the bot

1. In Telegram, message **@BotFather** → `/newbot`
2. Pick a name and a username (must end in `bot`, e.g. `adi_calendar_bot`)
3. BotFather gives you a token like `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` — save it

## 2. Environment variables

Add to `backend/.env` (local) and to the Vercel project's env vars (production):

| Variable | Value |
|---|---|
| `TELEGRAM_PERSONAL_BOT_TOKEN` | the token from BotFather |
| `TELEGRAM_PERSONAL_WEBHOOK_SECRET` | any random string you make up (e.g. `openssl rand -hex 16`) |

Everything else (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
`ANTHROPIC_API_KEY`, `DATABASE_URL`) is already set up from the family bot and is reused as-is —
same Google account, same OAuth scopes (`calendar.readonly` + `calendar.events`) already cover
your primary calendar.

## 3. Find your chat id

```
cd backend
npm run bot:personal      # runs it locally against your new token
```

Open your new bot in Telegram and send it any message (e.g. "hi"), then in another terminal:

```
npm run personal:whoami
```

This prints your chat id. Add it to `PERSONAL_ALLOWED_CHAT_IDS` in
`backend/config/personal.mjs`:

```js
export const PERSONAL_ALLOWED_CHAT_IDS = [
  123456789, // you
];
```

Without this, the bot will reply but refuse to act — it's a private bot, not a public one.

## 4. Try it locally

With `npm run bot:personal` still running (or restarted after editing the config), message the
bot in Telegram — try a question first ("מה יש לי היום?"), then an add/change/delete.

## 5. Deploy

Commit, push, let Vercel deploy as usual. Then register the webhook against the deployed URL:

```
npm run webhook:personal set https://<your-app>.vercel.app/api/telegram-personal <your-webhook-secret>
```

Check it took effect:

```
npm run webhook:personal info
```

From here it's live — message the bot any time.

## Notes

- The bot only ever touches your **primary** Google calendar (`config/personal.mjs` →
  `PERSONAL_CALENDAR_ID = "primary"`). It never reads or writes the kids' calendars.
- Recurring events are expanded into individual instances when read; editing/deleting one via the
  bot only affects that instance, not the whole series.
- All-day events (no specific time) are supported for add/change — just say something like
  "תוסיף חופשה ביום שישי, כל היום".
