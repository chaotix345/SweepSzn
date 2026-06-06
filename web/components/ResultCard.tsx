"use client";
import { useState } from "react";
import type { LineupResult, Player, Slot } from "@/lib/types";
import { teamColors, initials, eraLabel } from "@/lib/teams";
import { factorViews, lineupRoles, headline } from "@/lib/explain";

const GRADE_COLOR: Record<string, string> = {
  S: "text-fuchsia-400", "A+": "text-green-400", A: "text-green-400",
  B: "text-blue-400", C: "text-amber-400", D: "text-slate-400", F: "text-red-400",
};
const fmt = (n: number | null | undefined) => (n == null ? "–" : n.toFixed(1));

export default function ResultCard({
  result, players, slots, mode, onReset,
}: {
  result: LineupResult; players: Player[]; slots: Slot[]; mode: string; onReset: () => void;
}) {
  const factors = factorViews(result);
  const helps = factors.filter((f) => f.kind === "good");
  const hurts = factors.filter((f) => f.kind === "bad");
  const roles = lineupRoles(players, result.players);
  const totals = players.reduce(
    (a, p) => ({ pts: a.pts + (p.pts ?? 0), trb: a.trb + (p.trb ?? 0), ast: a.ast + (p.ast ?? 0), stl: a.stl + (p.stl ?? 0), blk: a.blk + (p.blk ?? 0) }),
    { pts: 0, trb: 0, ast: 0, stl: 0, blk: 0 }
  );
  const gradeColor = GRADE_COLOR[result.grade] ?? "text-zinc-300";

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      {/* hero */}
      <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 px-6 pt-6 pb-5 text-center">
        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{mode} · projected record</div>
        <div className={`mt-1 text-7xl font-black tabular-nums ${gradeColor}`}>
          {result.wins}<span className="text-zinc-600">–</span>{result.losses}
        </div>
        <div className="mt-1 text-lg font-bold tracking-wide">
          <span className={gradeColor}>{result.grade}</span> <span className="text-zinc-300">{result.label}</span>
        </div>
        <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">{headline(result)}</p>
        <div className="mt-4 flex justify-center gap-2 text-sm">
          <Metric label="ORtg" value={result.ortg.toFixed(1)} />
          <Metric label="DRtg" value={result.drtg.toFixed(1)} />
          <Metric label="Net" value={`${result.netRtg > 0 ? "+" : ""}${result.netRtg.toFixed(1)}`}
            color={result.netRtg >= 0 ? "text-green-400" : "text-red-400"} />
        </div>
      </div>

      {/* why this record */}
      <div className="border-t border-zinc-800 px-6 py-5">
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">Why this record</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FactorColumn title="What's helping" items={helps} kind="good" />
          <FactorColumn title="What's hurting" items={hurts} kind="bad" />
        </div>
        {result.notes.map((n, i) => (
          <p key={i} className="mt-3 flex gap-2 text-xs text-amber-500/80">
            <span aria-hidden>⚠</span><span>{n}</span>
          </p>
        ))}
      </div>

      {/* roster */}
      <div className="border-t border-zinc-800 px-4 py-4">
        <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-zinc-500">Your starting five</div>
        <div className="space-y-1.5">
          {players.map((p, i) => {
            const role = roles[i];
            const c = teamColors(p.team);
            return (
              <div key={p.id} className="rounded-xl bg-zinc-950/60 px-2.5 py-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg text-[11px] font-black leading-none"
                    style={{ background: c.bg, color: c.text }}>
                    <span>{initials(p.name)}</span>
                    <span className="mt-0.5 text-[8px] font-bold opacity-80">{slots[i]}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-semibold">{p.name}</span>
                      <span className="shrink-0 text-[10px] text-zinc-500">{p.team} · {eraLabel(p.decade)}</span>
                    </div>
                    <div className="text-[11px] text-orange-400/90">{role.role}<span className="text-zinc-600"> · {role.blurb}</span></div>
                  </div>
                  <StatRow p={p} className="hidden shrink-0 sm:flex" />
                </div>
                <StatRow p={p} className="mt-1.5 flex justify-between px-1 sm:hidden" />
              </div>
            );
          })}
        </div>
        {/* totals */}
        <div className="mt-2 flex items-center justify-between gap-2 px-2.5 sm:justify-end sm:gap-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-600 sm:mr-auto">Team totals</span>
          <div className="flex gap-2 sm:gap-2.5">
            <Stat v={totals.pts} k="PPG" strong /><Stat v={totals.trb} k="RPG" strong /><Stat v={totals.ast} k="APG" strong />
            <Stat v={totals.stl} k="SPG" strong /><Stat v={totals.blk} k="BPG" strong />
          </div>
        </div>
      </div>

      <div className="flex gap-3 border-t border-zinc-800 px-6 py-4">
        <ShareButton result={result} mode={mode} />
        <button onClick={onReset} className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-black hover:bg-orange-400">Build Another</button>
      </div>
    </div>
  );
}

function ShareButton({ result, mode }: { result: LineupResult; mode: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `My all-time five went ${result.wins}-${result.losses} (${result.label}) on 82-0 ${mode} — ORtg ${result.ortg} / DRtg ${result.drtg} / Net ${result.netRtg > 0 ? "+" : ""}${result.netRtg}. Can you beat it?`;
  const url = typeof window !== "undefined" ? window.location.origin : "https://82-0";
  const t = encodeURIComponent(text), u = encodeURIComponent(url);

  const copy = async () => {
    try { await navigator.clipboard?.writeText(`${text} ${url}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };
  const native = async () => {
    try { await (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share?.({ title: "82-0", text, url }); } catch { /* dismissed */ }
  };
  const links: [string, string][] = [
    ["X", `https://twitter.com/intent/tweet?text=${t}&url=${u}&hashtags=NBA,82and0`],
    ["Bluesky", `https://bsky.app/intent/compose?text=${t}%20${u}`],
    ["WhatsApp", `https://wa.me/?text=${t}%20${u}`],
    ["Reddit", `https://www.reddit.com/submit?title=${t}&url=${u}`],
    ["Telegram", `https://t.me/share/url?url=${u}&text=${t}`],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${u}`],
  ];
  const canNative = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="relative flex-1">
      <button onClick={() => (canNative ? native() : setOpen((o) => !o))} aria-haspopup={!canNative}
        className="w-full rounded-xl border border-zinc-700 py-2.5 text-sm font-semibold hover:border-zinc-500">
        {copied ? "Copied!" : "Share"}
      </button>
      {open && !canNative && (
        <div className="absolute bottom-full left-0 z-10 mb-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 p-2 shadow-xl">
          <button onClick={copy} className="mb-1 w-full rounded-lg bg-zinc-800 py-2 text-xs font-semibold hover:bg-zinc-700">
            {copied ? "Copied to clipboard!" : "Copy result"}
          </button>
          <div className="grid grid-cols-3 gap-1">
            {links.map(([name, href]) => (
              <a key={name} href={href} target="_blank" rel="noreferrer"
                className="rounded-lg bg-zinc-800 py-1.5 text-center text-[11px] font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white">{name}</a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, color = "text-zinc-200" }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-zinc-800/60 px-3 py-1.5">
      <span className="text-zinc-500">{label} </span><b className={`tabular-nums ${color}`}>{value}</b>
    </div>
  );
}

function FactorColumn({ title, items, kind }: { title: string; items: ReturnType<typeof factorViews>; kind: "good" | "bad" }) {
  const color = kind === "good" ? "text-green-400" : "text-red-400";
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold text-zinc-500">{title}</div>
      {items.length === 0 && (
        <div className="text-xs text-zinc-500">{kind === "bad" ? "No major weaknesses — a clean, balanced build." : "—"}</div>
      )}
      <div className="space-y-2">
        {items.map((f, i) => (
          <div key={i}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-zinc-300">{f.label}</span>
              <span className={`shrink-0 tabular-nums font-semibold ${color}`}>{f.value > 0 ? "+" : ""}{f.value.toFixed(1)}</span>
            </div>
            <div className="text-[11px] leading-snug text-zinc-500">{f.blurb}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatRow({ p, className }: { p: Player; className?: string }) {
  return (
    <div className={`gap-2.5 text-center text-[11px] text-zinc-400 ${className ?? ""}`}>
      <Stat v={p.pts} k="PPG" /><Stat v={p.trb} k="RPG" /><Stat v={p.ast} k="APG" />
      <Stat v={p.stl} k="SPG" /><Stat v={p.blk} k="BPG" />
    </div>
  );
}

function Stat({ v, k, strong }: { v: number | null | undefined; k: string; strong?: boolean }) {
  return (
    <div className="w-9">
      <div className={`tabular-nums ${strong ? "font-bold text-zinc-200" : "font-semibold text-zinc-300"}`}>{fmt(v)}</div>
      <div className="text-[8px] uppercase tracking-wide text-zinc-600">{k}</div>
    </div>
  );
}
