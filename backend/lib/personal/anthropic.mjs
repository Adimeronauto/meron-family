// Understands a message to the personal-calendar bot: answers questions about the calendar and
// parses add/change/delete-event requests. One structured call per message. Separate system
// prompt from lib/anthropic.mjs (the kids' bot) — no per-kid routing, no task checklist, just one
// person's own general events.
//
// Model: Haiku 4.5 — same choice as the family bot, same reasoning (simple Hebrew NL parsing at
// personal volume). Change MODEL to "claude-opus-5" for stronger understanding at ~10x the cost.

import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TIMEZONE } from "../../config/rules.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, "..", "..", ".env");
if (!process.env.ANTHROPIC_API_KEY && existsSync(ENV_PATH)) {
  try {
    process.loadEnvFile(ENV_PATH);
  } catch {
    /* handled below */
  }
}

const MODEL = "claude-haiku-4-5";

let client;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing — check backend/.env");
  client ??= new Anthropic();
  return client;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: ["question", "add", "change", "delete", "other"],
      description: "question=asking about the calendar; add/change/delete=modifying an event; other=greeting/unclear",
    },
    reply: {
      type: "string",
      description: "For question/other: the full Hebrew answer to send. Empty for add/change/delete.",
    },
    title: { type: "string", description: "Event title — for add, the new event's title; for change/delete, a keyword used to FIND the event. Empty if N/A." },
    newTitle: { type: "string", description: "For change only: a NEW title for the event, if the user wants to rename it (distinct from 'title', which only identifies which event they mean). Empty if not renaming." },
    date: { type: "string", description: "NEW event date YYYY-MM-DD (Asia/Jerusalem) — for add, and the new date for change. Empty if N/A." },
    startTime: { type: "string", description: "NEW start time HH:MM 24h — for add, and the new time for change. Empty if all-day or unchanged/N/A." },
    allDay: { type: "boolean", description: "True if the event has no specific time (all-day) — for add, and when changing an event to all-day." },
    durationMinutes: { type: "integer", description: "NEW duration in minutes; 60 if unspecified for a timed add; 0 if unchanged/N/A/all-day." },
    location: { type: "string", description: "Event location/place, if mentioned. Empty if N/A." },
    findDate: { type: "string", description: "For change/delete only: the CURRENT date YYYY-MM-DD of the existing event, used to locate it. Empty if not stated." },
    findTime: { type: "string", description: "For change/delete only: the CURRENT time HH:MM of the existing event, used to locate it. Empty if not stated." },
    confirmation: {
      type: "string",
      description: "For add/change/delete: one short Hebrew sentence asking the user to confirm the action. Empty otherwise.",
    },
  },
  required: [
    "intent", "reply", "title", "newTitle", "date", "startTime", "allDay",
    "durationMinutes", "location", "findDate", "findTime", "confirmation",
  ],
};

/**
 * @param text the user's message
 * @param ctx  { nowIso, weekday, scheduleText }
 * @returns parsed object matching SCHEMA
 */
export async function interpret(text, ctx) {
  const system = [
    "את/ה עוזר/ת אישי/ת שמנהל/ת את היומן הפרטי של המשתמש/ת.",
    `היום: ${ctx.weekday}, ${ctx.nowIso} (אזור זמן ${TIMEZONE}).`,
    "",
    "היומן הקרוב:",
    ctx.scheduleText || "(אין אירועים קרובים)",
    "",
    "כללים:",
    "- אם זו שאלה על היומן (למשל 'מה יש לי מחר?', 'מתי הפגישה עם הרופא?', 'מתי אני פנוי/ה ביום שלישי?') — ענה/עני בעברית בשדה reply, קצר וברור, על סמך היומן למעלה בלבד. אל תמציא אירועים.",
    "- אם מבקשים להוסיף/לשנות/למחוק אירוע — חלץ את הפרטים ונסח משפט אישור קצר בעברית בשדה confirmation. אל תכתוב reply.",
    "  • הוספה (add): title=שם האירוע, date/startTime/durationMinutes=פרטי האירוע החדש. אם האירוע הוא ליום שלם ללא שעה מסוימת (למשל 'חופשה', 'יום הולדת') — allDay=true והשאר startTime ריק.",
    "  • שינוי (change): title=מילת מפתח לזיהוי האירוע; findDate/findTime=התאריך והשעה הנוכחיים של האירוע (לזיהוי); date/startTime/durationMinutes/allDay=הערכים החדשים (השאר ריק/false מה שלא משתנה). אם מבקשים גם לשנות את השם עצמו (למשל 'תשני את השם ל...', 'תקראי לזה...') — מלא/י newTitle בשם החדש; אחרת השאר/י אותו ריק.",
    "  • מחיקה (delete): title=מילת מפתח לזיהוי; findDate/findTime=התאריך והשעה של האירוע למחיקה. השאר date/startTime ריקים.",
    "  • אם מוזכר מיקום (כתובת, שם מקום) — מלא/י location.",
    "  • אם המשתמש מציין תאריך ושעה כדי לזהות אירוע קיים — תמיד מלא findDate ו-findTime.",
    "- המר ביטויי זמן יחסיים ('מחר', 'יום שלישי הבא', 'בעוד שבוע') לתאריך מוחלט לפי היום הנוכחי ואזור הזמן.",
    "- אם ההודעה סתמית (שלום/תודה) — intent='other' ו-reply קצר ואדיב בעברית.",
  ].join("\n");

  const message = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: text }],
  });

  const jsonText = message.content.find((b) => b.type === "text")?.text ?? "{}";
  return JSON.parse(jsonText);
}
