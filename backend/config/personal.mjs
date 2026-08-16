// Config for the personal calendar bot — a separate Telegram bot from the kids' scheduling one
// in config/routing.mjs. This one talks to Adi's own calendar (adi.meron1@gmail.com), which the
// family bot deliberately excludes (see EXCLUDED_CALENDAR_IDS in routing.mjs).
//
// Same Google account, same OAuth refresh token (lib/google-auth.mjs already has
// calendar.readonly + calendar.events scopes across all calendars), so no separate Google auth
// is needed — just a different Telegram bot token and a different calendarId.

// "primary" always resolves to the signed-in account's main calendar — no need to hardcode the
// email as a calendar id.
export const PERSONAL_CALENDAR_ID = "primary";

// Chat ids allowed to use this bot. Empty until you run `npm run personal:whoami` once (message
// the bot anything, then run the script to read your chat id back) and add it here.
export const PERSONAL_ALLOWED_CHAT_IDS = [
  // <your chat id>,
];

export function isAllowedChat(chatId) {
  return PERSONAL_ALLOWED_CHAT_IDS.includes(chatId);
}
