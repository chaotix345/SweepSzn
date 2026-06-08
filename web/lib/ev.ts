// Client-only analytics beacon. Fire-and-forget; must NEVER throw into the UI.
// Runs alongside the existing Vercel track() calls (we keep both — see spec §2).
export type EvName = "play" | "share";

export function ev(name: EvName, props: { uid?: string; mode?: string } = {}): void {
  try {
    const payload = JSON.stringify({ ev: name, ...props });
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav && typeof nav.sendBeacon === "function") {
      nav.sendBeacon("/api/ev", new Blob([payload], { type: "application/json" }));
      return;
    }
    void fetch("/api/ev", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics must never throw into the UI */
  }
}
