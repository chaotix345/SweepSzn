"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getUid } from "@/lib/streak";
import { useSessionContext } from "@/components/SessionProvider";
import { notificationText } from "@/lib/notify";
import type { NotifView } from "@/lib/types";
import { BellIcon } from "@/components/ui/icons";

function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// Re-engagement inbox. A bell + unread badge in the header that polls the uid-gated notifications
// endpoint; the dropdown lists challenge-response pings and deep-links to the creator dashboard.
// Self-disabling: renders nothing when notifications aren't configured (Redis absent -> 503).
export default function NotificationBell() {
  const { user } = useSessionContext();
  const uid = user?.uid ?? getUid(); // signed in: notifications are keyed by the account uid server-side
  const [view, setView] = useState<NotifView | null>(null);
  const [open, setOpen] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [highlight, setHighlight] = useState(0); // # of items that were unread when the panel opened
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Poll + refetch on focus, paused while the tab is hidden (mirrors ChallengeOwner). The fetch loop is
  // defined inside the effect and only setStates after an await, per react-hooks/set-state-in-effect.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/notifications?uid=${encodeURIComponent(uid)}`);
        if (!alive) return;
        if (r.status === 503) { setDisabled(true); return; }
        if (!r.ok) return;
        const v = (await r.json()) as NotifView;
        if (!alive) return;
        setDisabled(false); setView(v);
      } catch { /* keep last good view */ }
    };
    tick();
    const iv = setInterval(() => { if (!document.hidden) tick(); }, 45000);
    const onFocus = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => { alive = false; clearInterval(iv); document.removeEventListener("visibilitychange", onFocus); window.removeEventListener("focus", onFocus); };
  }, [uid]);

  // Escape + outside-click close the panel and restore focus to the bell.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); } };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);

  // Move keyboard/SR focus into the panel on open (WAI-ARIA disclosure entry point); Escape restores it.
  useEffect(() => { if (open) panelRef.current?.focus(); }, [open]);

  const toggle = useCallback(async () => {
    if (open) { setOpen(false); return; }
    // Items are newest-first and the read watermark splits the list, so the first `unread` are the new ones.
    setHighlight(view?.unread ?? 0);
    setOpen(true);
    setView((v) => (v ? { ...v, unread: 0 } : v)); // optimistic: clear the badge
    try { await fetch("/api/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uid }) }); } catch { /* best-effort */ }
  }, [open, view, uid]);

  if (disabled) return null;

  const unread = view?.unread ?? 0;
  const items = view?.items ?? [];

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={toggle}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="notif-panel"
        className="relative flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 transition hover:border-zinc-500"
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-black tabular-nums text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id="notif-panel"
          role="region"
          aria-label="Notifications"
          tabIndex={-1}
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/50 outline-none"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
            <span className="text-sm font-bold text-zinc-200">Notifications</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Challenge results</span>
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">
              No notifications yet.<br />
              <span className="text-zinc-600">Create a challenge — we&apos;ll tell you when a friend takes it.</span>
            </div>
          ) : (
            <ul className="max-h-[24rem] divide-y divide-zinc-800 overflow-y-auto">
              {items.map((n, i) => {
                const { title, body } = notificationText(n);
                const isNew = i < highlight;
                return (
                  <li key={`${n.id}:${i}`}>
                    <Link
                      href={`/play?own=${encodeURIComponent(n.challengeId)}`}
                      onClick={() => setOpen(false)}
                      className="flex gap-3 px-4 py-3 transition hover:bg-zinc-800/60"
                    >
                      <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isNew ? "bg-orange-500" : "bg-transparent"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-zinc-100">{title}</span>
                        <span className="mt-0.5 block text-xs text-zinc-400">{body}</span>
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-zinc-600">{relTime(n.ts)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
