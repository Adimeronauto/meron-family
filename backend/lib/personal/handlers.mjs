// Message + callback handling for the personal-calendar bot, shared by the local polling bot and
// the Vercel webhook. State (pending confirmations) is injected as `store` so each host picks its
// own backing — same pattern as lib/handlers.mjs (the kids' bot), kept as a fully separate module
// since it talks to a different calendar with no per-kid routing.

import { randomBytes } from "node:crypto";
import { interpret } from "./anthropic.mjs";
import { listEvents, createEvent, updateEvent, deleteEvent, msToWall } from "./calendar.mjs";
import { eventsToText, dayTime } from "./format.mjs";
import { isAllowedChat } from "../../config/personal.mjs";
import { TIMEZONE } from "../../config/rules.mjs";
import { sendMessage, sendConfirm, answerCallback, editMessageText } from "./telegram.mjs";

const nowIso = () => new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit", timeZone: TIMEZONE,
}).format(Date.now());
const weekday = () => new Intl.DateTimeFormat("he-IL", { weekday: "long", timeZone: TIMEZONE }).format(Date.now());

export async function handleMessage(auth, msg, store, { onSeen } = {}) {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  if (!text) return;

  onSeen?.(chatId, msg.from?.first_name ?? "?", text);

  if (!isAllowedChat(chatId)) {
    await sendMessage(chatId, "היי! הבוט הזה פרטי ולא מזהה אותך. אם זה אתה/את — הוסיפו את ה-chat id הזה ל-PERSONAL_ALLOWED_CHAT_IDS.");
    return;
  }

  // Wide window so change/delete can find an event however far out it is, but Claude only gets a
  // near-term slice as text context (compact, matches how far out a casual reference like "the
  // dentist appointment" realistically means) — keeps the AI prompt size and cost bounded.
  const items = await listEvents(auth, { fromMs: Date.now() - 864e5, toMs: Date.now() + 400 * 864e5 });
  const nearTerm = items.filter((i) => i.startMs <= Date.now() + 14 * 864e5);
  const scheduleText = eventsToText(nearTerm);

  let parsed;
  try {
    parsed = await interpret(text, { nowIso: nowIso(), weekday: weekday(), scheduleText });
  } catch (err) {
    console.error("interpret failed:", err.message);
    await sendMessage(chatId, "סליחה, לא הצלחתי להבין. אפשר לנסח שוב?");
    return;
  }

  if (parsed.intent === "question" || parsed.intent === "other") {
    await sendMessage(chatId, parsed.reply || "לא בטוח שהבנתי — אפשר לנסח שוב?");
    return;
  }

  if (parsed.intent === "add") {
    if (!parsed.date || (!parsed.allDay && !parsed.startTime) || !parsed.title) {
      await sendMessage(chatId, "חסרים לי פרטים (מה / מתי). אפשר לכתוב שוב עם הכותרת, היום והשעה?");
      return;
    }
    const token = randomBytes(6).toString("hex");
    await store.set(token, {
      intent: "add",
      chatId,
      event: {
        title: parsed.title,
        date: parsed.date,
        startTime: parsed.allDay ? "" : parsed.startTime,
        allDay: Boolean(parsed.allDay),
        durationMinutes: parsed.durationMinutes || 60,
        location: parsed.location || "",
      },
    });
    await sendConfirm(chatId, parsed.confirmation, { yesData: `y:${token}`, noData: `n:${token}` });
    return;
  }

  if (parsed.intent === "change" || parsed.intent === "delete") {
    const kw = (parsed.title || "").trim();
    const candidates = items.filter((i) => matchesTitle(i, kw) && locate(i, parsed.findDate, parsed.findTime));

    if (candidates.length === 0) {
      await sendMessage(chatId, "לא מצאתי אירוע כזה ביומן.");
      return;
    }
    if (candidates.length > 1) {
      const list = candidates.map((i) => `• ${i.title} — ${dayTime(i.startMs)}`).join("\n");
      await sendMessage(chatId, `מצאתי כמה אירועים כאלה:\n${list}\nאפשר לפרט (יום/שעה)?`);
      return;
    }

    const ev = candidates[0];
    const token = randomBytes(6).toString("hex");

    if (parsed.intent === "delete") {
      await store.set(token, { intent: "delete", chatId, eventId: ev.id });
      const t = parsed.confirmation || `למחוק את "${ev.title}" (${dayTime(ev.startMs)})?`;
      await sendConfirm(chatId, t, { yesData: `y:${token}`, noData: `n:${token}` });
      return;
    }

    const orig = msToWall(ev.startMs);
    const durMin = ev.endMs ? Math.round((ev.endMs - ev.startMs) / 60000) : 60;
    // allDay-ness: an explicit allDay=true always wins; a new startTime means "make it timed"
    // even if the original event was all-day; otherwise keep whatever the original event was.
    const allDay = parsed.allDay ? true : parsed.startTime ? false : ev.allDay;
    const newEvent = {
      date: parsed.date || orig.date,
      startTime: allDay ? "" : (parsed.startTime || orig.time),
      allDay,
      durationMinutes: parsed.durationMinutes || durMin,
      location: parsed.location || undefined,
    };
    const newTitle = (parsed.newTitle || "").trim();
    if (newTitle) newEvent.title = newTitle;

    await store.set(token, { intent: "change", chatId, eventId: ev.id, newEvent });
    const t = parsed.confirmation ||
      (newTitle
        ? `לעדכן את "${ev.title}" לשם "${newTitle}", ל-${newEvent.date} ${newEvent.startTime || "כל היום"}?`
        : `לעדכן את "${ev.title}" ל-${newEvent.date} ${newEvent.startTime || "כל היום"}?`);
    await sendConfirm(chatId, t, { yesData: `y:${token}`, noData: `n:${token}` });
  }
}

export async function handleCallback(auth, cb, store) {
  const [action, token] = (cb.data ?? "").split(":");
  const item = await store.get(token);
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;

  if (!item) {
    await answerCallback(cb.id, "פג תוקף");
    if (chatId && messageId) await editMessageText(chatId, messageId, "⌛ הבקשה כבר לא רלוונטית.");
    return;
  }
  await store.del(token);

  if (action === "n") {
    await answerCallback(cb.id, "בוטל");
    await editMessageText(chatId, messageId, "❌ בוטל.");
    return;
  }

  try {
    if (item.intent === "add") {
      await createEvent(auth, item.event);
      await answerCallback(cb.id, "נוסף ✓");
      await editMessageText(chatId, messageId, "✅ נוסף ליומן.");
    } else if (item.intent === "change") {
      await updateEvent(auth, item.eventId, item.newEvent);
      await answerCallback(cb.id, "עודכן ✓");
      await editMessageText(chatId, messageId, "✅ עודכן ביומן.");
    } else if (item.intent === "delete") {
      await deleteEvent(auth, item.eventId);
      await answerCallback(cb.id, "נמחק ✓");
      await editMessageText(chatId, messageId, "✅ נמחק מהיומן.");
    }
  } catch (err) {
    console.error(`${item.intent} failed:`, err.message);
    await answerCallback(cb.id, "שגיאה");
    await editMessageText(chatId, messageId, "⚠️ לא הצלחתי לבצע. נסו שוב.");
  }
}

function matchesTitle(item, kw) {
  if (!kw) return true;
  const t = item.title ?? "";
  return t.includes(kw) || kw.includes(t);
}

const normHM = (s) => {
  const [h, m] = String(s).split(":");
  return `${String(h).padStart(2, "0")}:${String(m ?? "00").padStart(2, "0")}`;
};

function locate(item, findDate, findTime) {
  const w = msToWall(item.startMs);
  if (findDate && w.date !== findDate) return false;
  if (findTime && normHM(w.time) !== normHM(findTime)) return false;
  return true;
}
