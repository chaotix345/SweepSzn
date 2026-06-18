// Fire-once dedupe for client analytics beacons. `device` persists in localStorage (once ever per
// browser), `session` in sessionStorage (once per tab/session). Returns true exactly when the caller
// should emit the signal. Storage-blocked (private mode / quota) → returns true so a real signal is
// never silently suppressed (the caller's mount-once guard bounds the worst case to one beacon).
export function once(scope: "session" | "device", key: string): boolean {
  try {
    const store = scope === "session" ? sessionStorage : localStorage;
    if (store.getItem(key)) return false;
    store.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}
