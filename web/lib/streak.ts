// Client-only identity + streak state (localStorage). Anonymous: a uuid identifies you, a name
// is shown on the board. Streaks are derived from the set of completed Daily dates — no server.

const K = { uid: "82-0:uid", name: "82-0:name", hist: "82-0:daily:history" };
const dayMs = 86400000;
const utcKey = (t: number) => { const d = new Date(t); return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`; };

let memUid = ""; // stable per-session fallback when localStorage is unavailable (private mode, quota)
export function getUid(): string {
  try {
    let u = localStorage.getItem(K.uid);
    if (!u) { u = crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem(K.uid, u); }
    return u;
  } catch {
    // must satisfy the submit routes' /^[a-z0-9-]{8,64}$/i, so "anon" (4 chars) won't do
    if (!memUid) memUid = `anon-${Math.random().toString(36).slice(2).padEnd(8, "0")}`;
    return memUid;
  }
}

export function getName(): string { try { return localStorage.getItem(K.name) ?? ""; } catch { return ""; } }
export function setName(n: string): void { try { localStorage.setItem(K.name, n); } catch { /* no storage */ } }

function history(): string[] { try { return JSON.parse(localStorage.getItem(K.hist) ?? "[]"); } catch { return []; } }

// The raw set of completed-Daily date-keys, for the one-time sign-in migration (lib/account.syncToAccount).
export function getHistory(): string[] { return history(); }

export function recordDailyDone(date: string): void {
  try {
    const h = history();
    if (!h.includes(date)) { h.push(date); localStorage.setItem(K.hist, JSON.stringify(h.slice(-400))); }
  } catch { /* no storage */ }
}

// consecutive UTC days completed, ending today (or yesterday, so a streak survives until day's end)
export function getStreak(): number {
  const set = new Set(history());
  if (!set.size) return 0;
  const now = Date.now();
  const anchor = set.has(utcKey(now)) ? now : set.has(utcKey(now - dayMs)) ? now - dayMs : 0;
  if (!anchor) return 0;
  let streak = 0;
  for (let t = anchor; set.has(utcKey(t)); t -= dayMs) streak++;
  return streak;
}

export function msToNextUtcMidnight(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - d.getTime();
}
