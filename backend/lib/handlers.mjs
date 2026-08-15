// Message + callback handling, shared by the local polling bot and the Vercel webhook.
// State (pending confirmations) is injected as `store` so each host picks its own backing.

import { randomBytes } from "node:crypto";
import { buildSchedule } from "./schedule.mjs";
import { scheduleToText } from "./schedule-text.mjs";
import { interpret } from "./anthropic.mjs";
import { createLesson, updateLesson, deleteLesson, msToWall } from "./calendar-write.mjs";
import { resolveAsker } from "../config/people-telegram.mjs";
import { WRITE_CALENDAR_ID } from "../config/routing.mjs";
import { TIMEZONE } from "./../config/rules.mjs";
import { sendMessage, sendConfirm, answerCallback, editMessageText } from "./telegram.mjs";

const nowIso = () => new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit", timeZone: TIMEZONE,
}).format(Date.now());
const weekday = () => new Intl.DateTimeFormat("he-IL", { weekday: "long", timeZone: TIMEZONE }).format(Date.now());

export async function handleMessage(auth, msg, store, { onSeen, tasks } = {}) {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  if (!text) return;

  onSeen?.(chatId, msg.from?.first_name ?? "?", text);

  const asker = resolveAsker(chatId);
  if (!asker) {
    await sendMessage(chatId, "היי! עדיין לא זיהיתי אותך במערכת. בקש/י מעדי להוסיף אותך.");
    return;
  }

  // A parent sees both kids; a kid sees only their own events as context.
  //
  // Fetch a full year so change/delete can find and edit a lesson however far out it is — but
  // Claude only gets the near-term slice as text context (compact, matches how far out a casual
  // reference like "the guitar lesson" realistically means), so the AI prompt size and cost don't
  // grow with the wider fetch.
  const ownerKeys = asker.role === "parent" ? ["amit", "nadav"] : [asker.role];
  const schedule = await buildSchedule(auth, { toMs: Date.now() + 365 * 864e5 });
  const nearTerm = schedule.all.filter((i) => i.startMs <= Date.now() + 14 * 864e5);
  const scheduleText = scheduleToText(nearTerm, ownerKeys);

  let parsed;
  try {
    parsed = await interpret(text, {
      askerLabel: asker.label, nowIso: nowIso(), weekday: weekday(), scheduleText,
    });
  } catch (err) {
    console.error("interpret failed:", err.message);
    await sendMessage(chatId, "סליחה, לא הצלחתי להבין. אפשר לנסח שוב?");
    return;
  }

  if (parsed.intent === "question" || parsed.intent === "other") {
    await sendMessage(chatId, parsed.reply || "לא בטוח שהבנתי — אפשר לנסח שוב?");
    return;
  }

  // --- Tasks: a simple per-kid checklist ---
  if (parsed.intent === "task_list" || parsed.intent === "task_add" || parsed.intent === "task_done") {
    if (!tasks) {
      await sendMessage(chatId, "ניהול משימות עדיין לא זמין כאן.");
      return;
    }
    const isKid = parsed.person === "amit" || parsed.person === "nadav";
    const nameOf = (p) => (p === "amit" ? "עמית" : "נדב");

    if (parsed.intent === "task_list") {
      const owners = isKid ? [parsed.person] : ["amit", "nadav"];
      const parts = [];
      for (const o of owners) {
        const list = await tasks.list(o);
        parts.push(
          list.length
            ? `<b>${nameOf(o)}:</b>\n` + list.map((t) => `• ${t.title}`).join("\n")
            : `<b>${nameOf(o)}:</b> אין משימות פתוחות 🎉`
        );
      }
      await sendMessage(chatId, parts.join("\n\n"));
      return;
    }

    if (parsed.intent === "task_add") {
      const title = (parsed.taskTitle || "").trim();
      if (!isKid || !title) {
        await sendMessage(chatId, "למי להוסיף את המשימה — עמית או נדב? ומה המשימה?");
        return;
      }
      const token = randomBytes(6).toString("hex");
      await store.set(token, { intent: "task_add", chatId, owner: parsed.person, title });
      const t = parsed.confirmation || `להוסיף ל${nameOf(parsed.person)} משימה: "${title}"?`;
      await sendConfirm(chatId, t, { yesData: `y:${token}`, noData: `n:${token}` });
      return;
    }

    // task_done
    if (!isKid) {
      await sendMessage(chatId, "של מי המשימה — עמית או נדב?");
      return;
    }
    const kw = (parsed.taskTitle || "").trim();
    const list = await tasks.list(parsed.person);
    const matches = kw ? list.filter((t) => t.title.includes(kw) || kw.includes(t.title)) : list;
    if (matches.length === 0) {
      await sendMessage(chatId, "לא מצאתי משימה כזו ברשימה.");
      return;
    }
    if (matches.length > 1) {
      await sendMessage(chatId, "לאיזו משימה הכוונה?\n" + matches.map((t) => `• ${t.title}`).join("\n"));
      return;
    }
    const task = matches[0];
    const token = randomBytes(6).toString("hex");
    await store.set(token, { intent: "task_done", chatId, owner: parsed.person, taskId: task.id });
    const t = parsed.confirmation || `לסמן שהושלמה המשימה "${task.title}" של ${nameOf(parsed.person)}?`;
    await sendConfirm(chatId, t, { yesData: `y:${token}`, noData: `n:${token}` });
    return;
  }

  if (parsed.intent === "add") {
    if (!parsed.date || !parsed.startTime || parsed.person === "unknown") {
      await sendMessage(chatId, "חסרים לי פרטים (למי / מתי). אפשר לכתוב שוב עם השם, היום והשעה?");
      return;
    }
    const token = randomBytes(6).toString("hex");
    await store.set(token, { intent: "add", chatId, lesson: {
      person: parsed.person, title: parsed.title, date: parsed.date,
      startTime: parsed.startTime, durationMinutes: parsed.durationMinutes || 60,
    }});
    await sendConfirm(chatId, parsed.confirmation, { yesData: `y:${token}`, noData: `n:${token}` });
    return;
  }

  if (parsed.intent === "change" || parsed.intent === "delete") {
    const kw = (parsed.title || "").trim();
    const candidates = schedule.all.filter(
      (i) =>
        i.calendarId === WRITE_CALENDAR_ID &&
        matchesPerson(i, parsed.person) &&
        matchesTitle(i, kw) &&
        locate(i, parsed.findDate, parsed.findTime)
    );

    if (candidates.length === 0) {
      await sendMessage(chatId, "לא מצאתי שיעור כזה ביומן המשפחה.");
      return;
    }
    if (candidates.length > 1) {
      const list = candidates.map((i) => `• ${i.title} — ${dayTime(i.startMs)}`).join("\n");
      await sendMessage(chatId, `מצאתי כמה שיעורים כאלה:\n${list}\nאפשר לפרט (יום/שעה)?`);
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
    const newLesson = {
      date: parsed.date || orig.date,
      startTime: parsed.startTime || orig.time,
      durationMinutes: parsed.durationMinutes || durMin,
    };
    // Renaming needs the matched event's own owner (not parsed.person, which may be "unknown")
    // so the "<name>: <title>" prefix that owner-routing depends on is reconstructed correctly.
    const newTitle = (parsed.newTitle || "").trim();
    if (newTitle) { newLesson.title = newTitle; newLesson.owner = ev.owner; }

    await store.set(token, { intent: "change", chatId, eventId: ev.id, newLesson });
    const t = parsed.confirmation ||
      (newTitle
        ? `לעדכן את "${ev.title}" לשם "${newTitle}", ל-${newLesson.date} ${newLesson.startTime}?`
        : `לעדכן את "${ev.title}" ל-${newLesson.date} ${newLesson.startTime}?`);
    await sendConfirm(chatId, t, { yesData: `y:${token}`, noData: `n:${token}` });
  }
}

export async function handleCallback(auth, cb, store, { tasks } = {}) {
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
      await createLesson(auth, item.lesson);
      await answerCallback(cb.id, "נוסף ✓");
      await editMessageText(chatId, messageId, "✅ נוסף ליומן.");
    } else if (item.intent === "change") {
      await updateLesson(auth, item.eventId, item.newLesson);
      await answerCallback(cb.id, "עודכן ✓");
      await editMessageText(chatId, messageId, "✅ עודכן ביומן.");
    } else if (item.intent === "delete") {
      await deleteLesson(auth, item.eventId);
      await answerCallback(cb.id, "נמחק ✓");
      await editMessageText(chatId, messageId, "✅ נמחק מהיומן.");
    } else if (item.intent === "task_add") {
      await tasks.add(item.owner, item.title);
      await answerCallback(cb.id, "נוסף ✓");
      await editMessageText(chatId, messageId, "✅ המשימה נוספה.");
    } else if (item.intent === "task_done") {
      await tasks.setDone(item.taskId, item.owner);
      await answerCallback(cb.id, "בוצע ✓");
      await editMessageText(chatId, messageId, "✅ המשימה סומנה כבוצעה.");
    }
  } catch (err) {
    console.error(`${item.intent} failed:`, err.message);
    await answerCallback(cb.id, "שגיאה");
    await editMessageText(chatId, messageId, "⚠️ לא הצלחתי לבצע. נסו שוב.");
  }
}

function matchesPerson(item, person) {
  if (!person || person === "unknown") return true;
  if (person === "both") return true;
  return item.owner === person || item.owner === "both";
}

function matchesTitle(item, kw) {
  if (!kw) return true;
  const t = item.title ?? "";
  const raw = item.rawTitle ?? "";
  return t.includes(kw) || kw.includes(t) || raw.includes(kw);
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

const dayTimeFmt = new Intl.DateTimeFormat("he-IL", {
  weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE,
});
const dayTime = (ms) => dayTimeFmt.format(ms);
