"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { track } from "@vercel/analytics";
import { ev } from "@/lib/ev";
import { getUid } from "@/lib/streak";
import { encodeRankCard, type RankCard } from "@/lib/rankShare";

// Read the Web Share capability hydration-safely: false on the server + first client render
// (matches SSR), then the real value — no setState-in-effect, no hydration mismatch.
const subscribe = () => () => {};
const getCanNative = () => typeof navigator !== "undefined" && "share" in navigator;
const getServerCanNative = () => false;

export default function RankShareButton({ card }: { card: RankCard }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const canNative = useSyncExternalStore(subscribe, getCanNative, getServerCanNative);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const where = card.scope === "daily" ? "today's Daily board" : card.scope === "week" ? "this week's board" : "the all-time board";
  const metric = card.scope === "daily" ? `${card.wins}-${card.losses}` : `${card.wins.toLocaleString()} wins`;
  const text = `I'm #${card.rank} of ${card.total.toLocaleString()} on ${where} (${metric}) at SweepSzn. Can you rank higher? via @SweepSeason`;
  const path = `/rank/${encodeRankCard(card)}`;
  const url = typeof window !== "undefined" ? new URL(path, window.location.origin).toString() : path;
  const t = encodeURIComponent(text), u = encodeURIComponent(url);

  const copy = async () => {
    try { await navigator.clipboard?.writeText(`${text} ${url}`); setCopied(true); track("share_rank", { target: "copy", scope: card.scope }); ev("share", { uid: getUid() }); setTimeout(() => setCopied(false), 1500); } catch { /* no clipboard */ }
  };
  const native = async () => {
    try { await (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share?.({ title: "SweepSzn", text, url }); track("share_rank", { target: "native", scope: card.scope }); ev("share", { uid: getUid() }); } catch { /* dismissed */ }
  };
  const links: [string, string][] = [
    ["X", `https://twitter.com/intent/tweet?text=${t}&url=${u}`],
    ["WhatsApp", `https://wa.me/?text=${t}%20${u}`],
    ["Reddit", `https://www.reddit.com/submit?title=${t}&url=${u}`],
  ];

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => (canNative ? native() : setOpen((o) => !o))} aria-haspopup={!canNative} aria-expanded={open} aria-controls="rank-share-panel"
        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold hover:border-zinc-500">
        Share rank
      </button>
      {open && !canNative && (
        <div id="rank-share-panel" className="absolute bottom-full right-0 z-10 mb-2 w-44 rounded-xl border border-zinc-700 bg-zinc-900 p-2 shadow-xl">
          <button onClick={copy} className="mb-1 w-full rounded-lg bg-zinc-800 py-1.5 text-xs font-semibold hover:bg-zinc-700">
            {copied ? "Copied!" : "Copy link"}
          </button>
          <div className="grid grid-cols-3 gap-1">
            {links.map(([name, href]) => (
              <a key={name} href={href} target="_blank" rel="noreferrer" onClick={() => { track("share_rank", { target: name, scope: card.scope }); ev("share", { uid: getUid() }); }}
                className="rounded-lg bg-zinc-800 py-1 text-center text-[11px] font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white">{name}</a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
