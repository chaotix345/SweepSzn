// Fire-once dedupe for client analytics beacons. `device` persists in localStorage (once ever per
// browser), `session` in sessionStorage (once per tab/session). Returns true exactly when the caller
// should emit the signal.
//
// When storage is unavailable (private mode, blocked, or a `setItem` quota error) we can't persist
// the gate — but we must NOT then return true on every call, or a once-per-device signal collapses
// into a per-call one (e.g. first_play would equal play). An in-memory fallback bounds storage
// failures to one emit per page-load instead, while still never silently suppressing a real signal.
const memoFired = new Set<string>();

export function once(scope: "session" | "device", key: string): boolean {
  try {
    const store = scope === "session" ? sessionStorage : localStorage;
    if (store.getItem(key)) return false;
    store.setItem(key, "1");
    return true;
  } catch {
    const memoKey = `${scope}:${key}`;
    if (memoFired.has(memoKey)) return false;
    memoFired.add(memoKey);
    return true;
  }
}
