// Understands a family member's Telegram message: answers schedule questions and parses
// add/change/delete-lesson requests. One structured call per message.
//
// Model: Haiku 4.5 — the task is simple Hebrew NL parsing at family volume, so this fits the
// stated budget. Change MODEL to "claude-opus-5" for stronger understanding at ~10x the cost.

import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TIMEZONE } from "../config/rules.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, "..", ".env");
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

// Structured-output schema. Every field is required (structured outputs need that), so
// irrelevant fields are filled with empty placeholders per intent — we read only what applies.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: ["question", "add", "change", "delete", "task_add", "task_list", "task_done", "other"],
      description: "question=asking about the schedule; add/change/delete=modifying a lesson; task_add/task_list/task_done=managing a kid's to-do checklist; other=greeting/unclear",
    },
    reply: {
      type: "string",
      description: "For question/other: the full Hebrew answer to send. Empty for add/change/delete.",
    },
    person: {
      type: "string",
      enum: ["amit", "nadav", "both", "unknown"],
      description: "Whose lesson, for add/change/delete. 'unknown' if not stated.",
    },
    title: { type: "string", description: "Lesson title / keyword used to FIND the lesson, e.g. 'שיעור גיטרה' or 'מנטלי'. Empty if N/A." },
    newTitle: { type: "string", description: "For change only: a NEW name for the lesson, if the user wants to rename it (distinct from 'title', which only identifies which lesson they mean). Empty if not renaming." },
    taskTitle: { type: "string", description: "For task_add: the task text ('לארוז תיק אימון'). For task_done: a keyword to find the task. Empty if N/A." },
    date: { type: "string", description: "NEW event date YYYY-MM-DD (Asia/Jerusalem) — for add, and the new date for change. Empty if N/A." },
    startTime: { type: "string", description: "NEW start time HH:MM 24h — for add, and the new time for change. Empty if unchanged/N/A." },
    durationMinutes: { type: "integer", description: "NEW duration in minutes; 60 if unspecified for add; 0 if unchanged/N/A." },
    findDate: { type: "string", description: "For change/delete only: the CURRENT date YYYY-MM-DD of the existing lesson, used to locate it. Empty if not stated." },
    findTime: { type: "string", description: "For change/delete only: the CURRENT time HH:MM of the existing lesson, used to locate it. Empty if not stated." },
    confirmation: {
      type: "string",
      description: "For add/change/delete: one short Hebrew sentence asking the user to confirm the action. Empty otherwise.",
    },
  },
  required: ["intent", "reply", "person", "title", "newTitle", "taskTitle", "date", "startTime", "durationMinutes", "findDate", "findTime", "confirmation"],
};

/**
 * @param text the user's message
 * @param ctx  { askerLabel, nowIso, weekday, scheduleText }
 * @returns parsed object matching SCHEMA
 */
export async function interpret(text, ctx) {
  const system = [
    "את/ה עוזר/ת למשפחת מרון לנהל את לוח הזמנים של הילדים.",
    "הילדים: עמית (בן 15) ונדב (בן 11).",
    `היום: ${ctx.weekday}, ${ctx.nowIso} (אזור זמן ${TIMEZONE}).`,
    `הפונה: ${ctx.askerLabel}.`,
    "",
    "לוח הזמנים הקרוב:",
    ctx.scheduleText || "(אין אירועים קרובים)",
    "",
    "כללים:",
    "- אם זו שאלה על הלוח (למשל 'מה יש לי מחר?', 'מתי המבחן הבא של נדב?') — ענה/עני בעברית בשדה reply, קצר וברור, על סמך לוח הזמנים למעלה בלבד. אל תמציא אירועים.",
    "- אם מבקשים להוסיף/לשנות/למחוק שיעור — חלץ את הפרטים ונסח משפט אישור קצר בעברית בשדה confirmation. אל תכתוב reply.",
    "  • הוספה (add): title=שם השיעור, date/startTime/durationMinutes=פרטי השיעור החדש.",
    "  • שינוי (change): title=מילת מפתח לזיהוי השיעור; findDate/findTime=התאריך והשעה הנוכחיים של השיעור (לזיהוי); date/startTime/durationMinutes=הערכים החדשים (השאר ריק מה שלא משתנה). אם מבקשים גם לשנות/לתקן את השם של השיעור עצמו (למשל 'תשני את השם ל...', 'תקראי לזה...') — מלא/י newTitle בשם החדש; אחרת השאר/י אותו ריק.",
    "  • מחיקה (delete): title=מילת מפתח לזיהוי; findDate/findTime=התאריך והשעה של השיעור למחיקה. השאר date/startTime ריקים.",
    "  • אם המשתמש מציין תאריך ושעה כדי לזהות שיעור קיים — תמיד מלא findDate ו-findTime.",
    "- לכל ילד יש רשימת משימות (צ'ק-ליסט פשוט, בלי תאריכים). ניהול משימות:",
    "  • הוספת משימה (task_add): person=למי (עמית/נדב), taskTitle=טקסט המשימה. נסח confirmation קצר לאישור. אל תכתוב reply.",
    "  • שאלה על המשימות ('מה המשימות של נדב?', 'מה נשאר לעמית לעשות?') → intent='task_list', person=למי. השאר reply ריק (הבוט ישלוף וירכיב את הרשימה בעצמו).",
    "  • סימון משימה כבוצעה (task_done): person=למי, taskTitle=מילת מפתח לזיהוי המשימה. נסח confirmation קצר.",
    "  • אם לא צויין למי המשימה (task_add/task_done) — person='unknown', והבוט ישאל.",
    "- המר ביטויי זמן יחסיים ('מחר', 'יום שלישי הבא', 'בעוד שבוע') לתאריך מוחלט לפי היום הנוכחי ואזור הזמן.",
    "- אם לא ברור למי השיעור, קבע person='unknown'.",
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
