// Calendar → kid routing.
//
// This is the single source of truth for who an event belongs to and whether it may fire an
// overlay on a phone. Confirmed with Adi 2026-08-01 against the live calendar list.
//
// Two people today (עמית 15 / נדב 11). Adding a third kid is: add to PEOPLE, add their
// calendars here.

export const PEOPLE = {
  amit: { name: "עמית", telegramId: null }, // telegram ids filled in Phase 4
  nadav: { name: "נדב", telegramId: null },
};

// owner: "amit" | "nadav" | "both"
// kind:  "school"   — school-published, read-only. Type (test vs activity) comes from the title.
//        "holidays" — informational; shows in week view + morning message, never an overlay.
//        "personal" — the writable family calendar; per-event owner comes from a name prefix.
// overlay: may an event on this calendar interrupt a game?
// writable: the bot may create/edit events here.
export const CALENDARS = [
  // ── School calendars (read-only) ────────────────────────────────────────────
  {
    id: "hayovelhigh@gmail.com",
    label: "ארועים ופעילויות",
    owner: "amit",
    kind: "school",
    overlay: true,
    writable: false,
  },
  {
    id: "8dfcii2tm2fla83vtv220hvrf4@group.calendar.google.com",
    label: "מתכונות ובגרויות",
    owner: "amit",
    kind: "school",
    overlay: true,
    writable: false,
  },
  {
    id: "u7mfbgh1a2656tutro7shq00is@group.calendar.google.com",
    label: "ורדית שכבת יוד תשפז",
    owner: "amit",
    kind: "school",
    overlay: true,
    writable: false,
  },
  {
    // "ולדי" in the name is the principal, not a person to route to. Grade 7 = נדב.
    id: "ef9agb44icf5gq8c5njeieq46c@group.calendar.google.com",
    label: "לוח מבחנים שכבת ז' תשפ\"ז - ולדי",
    owner: "nadav",
    kind: "school",
    overlay: true,
    writable: false,
  },
  // (חגים בישראל / Israeli holidays calendar removed at Adi's request 2026-08-02 — not wanted
  //  in the kids' view.)

  // ── Family calendar (writable) ──────────────────────────────────────────────
  {
    // Where extracurricular lessons live and where the Telegram bot writes.
    // Per-event owner comes from a name prefix in the title (עמית: / נדב: / משפחה:).
    // No prefix → both kids (genuine family events are unlabelled).
    id: "8ff2af362317c734b53fb1b5bbad041ab8f673589a82fa53b632315fd8129510@group.calendar.google.com",
    label: "Meron family",
    owner: "prefix",
    kind: "personal",
    overlay: true,
    writable: true,
  },
];

// The bot writes new lessons here.
export const WRITE_CALENDAR_ID =
  "8ff2af362317c734b53fb1b5bbad041ab8f673589a82fa53b632315fd8129510@group.calendar.google.com";

// Calendars deliberately excluded from the kids' system entirely (parent/work):
//   Family (Google family group), לוח משותף עדי ואיתן, adi.meron1 primary, ייעוץ אוטומציות.
// They are never read for kid events and never fire overlays.
export const EXCLUDED_CALENDAR_IDS = [
  "family02385776592168565899@group.calendar.google.com",
  "5cf20ebdc9db9d279472ff20beb9e1152dce4d13988dc15786ad48c3114a3658@group.calendar.google.com",
  "adi.meron1@gmail.com",
  "c5f996ea45bcb2dca80d7490047f08ebb11f612213f004119c20500733dbce6c@group.calendar.google.com",
];
