// Maps Telegram chat ids to family members. Discover ids with `npm run telegram:whoami`
// (each person messages the bot once), then add them here.
//
// role: "parent" can ask about anyone and gets both kids in their schedule context.
//       "amit"/"nadav" ask about themselves (siblings can still be asked about — see bot.mjs).

export const TELEGRAM_PEOPLE = {
  1530613998: { role: "parent", label: "עדי (הורה)" },
  // <chatId>: { role: "nadav",  label: "נדב" },
  // <chatId>: { role: "amit",   label: "עמית" },
  // <chatId>: { role: "parent", label: "<שם> (הורה)" },
};

export function resolveAsker(chatId) {
  return TELEGRAM_PEOPLE[chatId] ?? null;
}
