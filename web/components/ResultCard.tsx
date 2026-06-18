"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { track } from "@vercel/analytics";
import { ev } from "@/lib/ev";
import { getUid } from "@/lib/streak";
import type { LineupResult, Player, PlayerBreakdown, Slot } from "@/lib/types";
import { teamColors, initials, eraLabel, displayName } from "@/lib/teams";
import { encodeLineup, cardImageUrl } from "@/lib/share";
import { bpCode, type BlueprintView } from "@/lib/blueprint";
import { factorViews, lineupRoles, headline, historyAnchor, scoutingAnchor, fmtNet, playerContribRows, type ContribRow } from "@/lib/explain";
import { WIN_GRADES, weakestSlot } from "@/lib/engine";
import { pickemVerdict, pickemShareLine, encodePickemCard } from "@/lib/pickem";
import { GRADE_COLOR, isEliteGrade } from "@/lib/grades";
import { Button, ButtonLink } from "@/components/ui/Button";
import { WhatIfLab } from "@/components/game/WhatIfLab";
import { RarityBadge } from "@/components/game/RarityBadge";
import { Dossier } from "@/components/game/Dossier";
import { DexStrip } from "@/components/game/DexStrip";
import { CompareLineup } from "@/components/game/CompareLineup";
import { ExploreZone } from "@/components/game/ExploreZone";

// Crowd snapshot + your vote (and, same-session only, the spun team/era the vote was about).
type PickemProp = { y: number; n: number; vote: "y" | "n" | null; subject?: string | null };
// Factor Hunt verdict: the locked pre-reveal prediction vs. the engine's actual top factor.
type FactorHuntProp = { prediction: string; answer: string; correct: boolean };
// Daily leaderboard standing at submit time (rank/total from the submit response) — context only.
type LbRankProp = { rank: number; total: number };

// The strongest SLOT-LEGAL five search_best.ts has ever found (verified through evaluateLineup)
// — the ceiling a player can actually draft, which is what the elite-result copy cites. The
// engine's theoretical max is 80-2, but that five needs two C-only bigs and can't be drafted.
// Re-run the script after any engine/data change; golden tests pin both numbers.
const BEST_DRAFTABLE_RECORD = "79-3";

// Grade-aware nudge above the share/replay row — frames sharing as a social act, not a chore.
function shareNudge(result: LineupResult): string {
  if (isEliteGrade(result.grade)) return "All-time tier. Show it off →";
  if (result.grade === "A") return "Strong five — worth sharing.";
  if (result.wins >= 41) return "Think a friend can beat it? Share the challenge.";
  return "Rough one. Share the carnage — or build another.";
}

const fmt = (n: number | null | undefined) => (n == null ? "–" : n.toFixed(1));

// Saveable/copyable breakdown card. The OG route already renders a clean 1200×630 PNG; this
// fetches it so a user (or the launch content workflow) can attach the card as a native image
// instead of relying on a link unfurl. Copy-to-clipboard appears only where the browser supports
// writing an image Blob (desktop) — the X-compose paste flow; download works everywhere.
export function SaveCardImage({ path }: { path: string }) {
  const [state, setState] = useState<"idle" | "busy" | "saved" | "copied" | "error">("idle");
  const canCopyImage =
    typeof window !== "undefined" && typeof ClipboardItem !== "undefined" && typeof navigator !== "undefined" && !!navigator.clipboard?.write;
  const flash = (s: "saved" | "copied" | "error") => { setState(s); setTimeout(() => setState("idle"), 2000); };
  const fetchCard = async (): Promise<Blob> => {
    const res = await fetch(new URL(cardImageUrl(path), window.location.origin).toString());
    if (!res.ok) throw new Error(`og ${res.status}`);
    return res.blob();
  };
  const save = async () => {
    setState("busy");
    try {
      const blob = await fetchCard();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href; a.download = "sweepszn-card.png";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(href);
      track("share", { target: "image-save" }); ev("share", { uid: getUid() });
      flash("saved");
    } catch { flash("error"); }
  };
  const copy = async () => {
    setState("busy");
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": fetchCard() })]);
      track("share", { target: "image-copy" }); ev("share", { uid: getUid() });
      flash("copied");
    } catch { flash("error"); }
  };
  const label = state === "busy" ? "Preparing…" : state === "saved" ? "Saved ✓" : state === "error" ? "Try again" : "Save card image";
  return (
    <div className="mt-2.5 flex gap-2">
      <button onClick={save} aria-label="Save card image"
        className="min-w-0 flex-1 rounded-xl border border-zinc-700 py-2 text-xs font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white">
        ↓ {label}
      </button>
      {canCopyImage && (
        <button onClick={copy} aria-label="Copy card image to clipboard"
          className="shrink-0 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white">
          {state === "copied" ? "Copied ✓" : "Copy"}
        </button>
      )}
    </div>
  );
}

export default function ResultCard({
  result, players, slots, mode, modeKey, onReset, shared, usedHints, pickem, factorHunt, prime, blueprint, lbRank,
}: {
  result: LineupResult; players: Player[]; slots: Slot[]; mode: string; modeKey?: string; onReset?: () => void; shared?: boolean; usedHints?: boolean; pickem?: PickemProp; factorHunt?: FactorHuntProp; prime?: boolean; blueprint?: BlueprintView; lbRank?: LbRankProp | null;
}) {
  const factors = factorViews(result);
  // split by the value's sign (what actually helped/hurt), not the engine's fixed label —
  // e.g. a below-average "Star defense" carries a negative value and belongs under "hurting".
  const helps = factors.filter((f) => f.value > 0);
  const hurts = factors.filter((f) => f.value < 0);
  const roles = lineupRoles(players, result.players);
  const contrib = playerContribRows(result.players);
  // R5: gradeless "which pick was my mistake?" teaching aid — names the lowest-value SLOT only,
  // never the player or a number, so it teaches forward without exposing the hint-gated fit.
  const weakSlot = weakestSlot(result, slots);
  const anchor = historyAnchor(result.wins);
  const winsDelta = result.wins - 41;
  // top-half ranks read as a percentile; bottom-half as a plain standing (Top 93% is a brag fail)
  const pct = lbRank && lbRank.total >= 10 ? Math.max(1, Math.ceil((100 * lbRank.rank) / lbRank.total)) : null;
  const totals = players.reduce(
    (a, p) => ({ pts: a.pts + (p.pts ?? 0), trb: a.trb + (p.trb ?? 0), ast: a.ast + (p.ast ?? 0), stl: a.stl + (p.stl ?? 0), blk: a.blk + (p.blk ?? 0) }),
    { pts: 0, trb: 0, ast: 0, stl: 0, blk: 0 }
  );
  const gradeColor = GRADE_COLOR[result.grade] ?? "text-zinc-300";
  // a recipient can reconstruct the exact result from these 5 ids (slot order). With Pick'Em
  // data the link goes through /pe/ so the OG card carries the crowd-split bar.
  const lineupSeg = encodeLineup(players.map((p) => p.id), usedHints, prime, blueprint ? bpCode(blueprint.key) : null);
  const hasPickem = !!pickem && (!!pickem.vote || pickem.y + pickem.n > 0);
  const sharePath = hasPickem ? `/pe/${encodePickemCard(lineupSeg, pickem!)}` : `/r/${lineupSeg}`;
  const names = players.map((p) => displayName(p.name));

  const elite = isEliteGrade(result.grade);
  // one roster row's dossier open at a time (tap ⓘ) — reuses the draft-board Dossier, post-commit
  const [openRosterId, setOpenRosterId] = useState<string | null>(null);
  // teaser for the collapsed Explore zone (What-If Lab is gated off Prime — see below)
  const exploreSummary = prime ? "Compare your five" : "What-If Lab · Compare";

  return (
    <div className={`mt-4 overflow-hidden rounded-2xl border bg-zinc-900 ${elite ? "border-gold/30 ring-1 ring-gold/25 animate-gold-pulse" : "animate-rise-in border-zinc-800"}`}>
      {/* hero — the buzzer moment: the record slams in; elite grades get the gold trophy glow */}
      <div className="relative isolate bg-gradient-to-b from-zinc-900 to-zinc-950 px-6 pt-6 pb-5 text-center">
        {/* elite-only radial gold wash behind the record — gold stays reserved for S/A+ / 82-0 */}
        {elite && <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gold-glow" />}
        <div aria-live="polite" aria-atomic="true">
          <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{mode} · simulated record</div>
          <div className={`mt-1 font-display text-7xl tabular-nums sm:text-8xl ${gradeColor} animate-record-slam`}>
            {result.wins}<span className="text-zinc-600">–</span>{result.losses}
          </div>
          <div className="mt-1 text-lg font-bold tracking-wide">
            <span className={gradeColor}>{result.grade}</span> <span className="text-zinc-300">{result.label}</span>
          </div>
        </div>
        {usedHints && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300/90"
            title="You used the engine's fit hints while drafting this five">💡 Hints used</div>
        )}
        {factorHunt && (
          <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              factorHunt.correct ? "bg-violet-500/15 text-violet-300" : "bg-zinc-700/40 text-zinc-400"}`}
            title={factorHunt.correct ? "Your pre-reveal prediction matched the engine's verdict" : "Your pre-reveal prediction missed"}>
            {factorHunt.correct
              ? <>🔮 Called it: {factorHunt.answer} · ×1.05 board bonus</>
              : <>🔮 You said {factorHunt.prediction} — it was {factorHunt.answer}</>}
          </div>
        )}
        {prime && (
          <>
            <div className="mt-2 ml-1 inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-violet-300"
              title="All-eras roster — every player at his statistical peak">⚡ PRIME</div>
            <p className="mt-2 text-[11px] text-violet-300/70">Fantasy simulation, not historical simulation — every player at his peak, eras crossed freely.</p>
          </>
        )}
        {blueprint && (
          <div className="mt-2 ml-1 inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300"
            title={`Committed before the spin: ${blueprint.label}`}>📐 {blueprint.label}</div>
        )}
        {/* context layer: real-history anchor, league-average baseline, verified ceiling, rank */}
        {anchor && (
          <p className="mt-2 text-xs italic text-zinc-400">
            Comparable to the {anchor.record} {anchor.team} ({anchor.season}) — {anchor.hook}.
          </p>
        )}
        <p className="mt-1 text-[11px] text-zinc-500">
          {winsDelta >= 1
            ? `+${winsDelta} win${winsDelta === 1 ? "" : "s"} above the 41-win NBA average`
            : winsDelta <= -1
              ? `${-winsDelta} win${winsDelta === -1 ? "" : "s"} below the 41-win NBA average`
              : "Right at the 41-win NBA average"}
        </p>
        {result.wins >= 72 && (
          <p className="mt-1 text-[11px] text-zinc-500">
            The best draftable five projects {BEST_DRAFTABLE_RECORD} — nobody has gone 82-0.
          </p>
        )}
        {pct != null && lbRank && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-orange-300"
            title="Your standing on today's server-verified leaderboard">
            {pct <= 50 ? <>🏆 Top {pct}% today</> : <>#{lbRank.rank} of {lbRank.total} today</>}
          </div>
        )}
        <GradeLadder wins={result.wins} grade={result.grade} />
        <p className="mx-auto mt-3 max-w-md text-base font-medium text-zinc-200">{headline(result)}</p>
        <div className="mt-4 flex justify-center gap-2 text-sm">
          <Metric label="ORtg" value={result.ortg.toFixed(1)} title="Offensive Rating — points scored per 100 possessions" />
          <Metric label="DRtg" value={result.drtg.toFixed(1)} title="Defensive Rating — points allowed per 100 possessions" />
          <Metric label="Net" value={`${result.netRtg > 0 ? "+" : ""}${result.netRtg.toFixed(1)}`}
            color={result.netRtg >= 0 ? "text-green-400" : "text-red-400"} title="Net Rating — offense minus defense, per 100 possessions" />
        </div>
      </div>

      {hasPickem && <PickemStrip result={result} pickem={pickem!} />}
      {blueprint && <BlueprintStrip result={result} bp={blueprint} />}

      {/* why this record */}
      <div className="border-t border-zinc-800 px-6 py-5">
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">Why this record</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FactorColumn title="What's helping" items={helps} kind="good" contrib={contrib} />
          <FactorColumn title="What's hurting" items={hurts} kind="bad" contrib={contrib} />
        </div>
        {result.notes.map((n, i) => (
          <p key={i} className="mt-3 flex gap-2 text-xs text-amber-500/80">
            <span aria-hidden>⚠</span><span>{n}</span>
          </p>
        ))}
        {weakSlot && (
          <p className="mt-3 flex gap-2 text-xs text-zinc-500">
            <span aria-hidden>🔎</span>
            <span>Lowest-value pick: your <strong className="text-zinc-300">{weakSlot}</strong> added the least to this five — something to rethink next run.</span>
          </p>
        )}
        <RarityBadge ids={players.map((p) => p.person_id ?? p.id).join(",")} />
      </div>

      {/* roster */}
      <div className="border-t border-zinc-800 px-4 py-4">
        <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-zinc-500">Your starting five</div>
        <div className="space-y-1.5">
          {players.map((p, i) => {
            const role = roles[i];
            const c = teamColors(p.team);
            const open = openRosterId === p.id;
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
                    <RoleBars pb={result.players[i]} />
                  </div>
                  <StatRow p={p} className="hidden shrink-0 sm:flex" />
                  {/* tap ⓘ → the same descriptive Dossier the draft board uses (accolades, career, era bars) */}
                  <button onClick={() => setOpenRosterId(open ? null : p.id)} aria-expanded={open}
                    aria-label={`${open ? "Hide" : "Show"} ${p.name} details`}
                    title="Player details — accolades, career, era context"
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-sm transition ${
                      open ? "border-orange-500 bg-orange-500/10 text-orange-400" : "border-zinc-800 text-zinc-500 hover:text-orange-400"}`}>
                    {open ? "▴" : "ⓘ"}
                  </button>
                </div>
                <StatRow p={p} className="mt-1.5 flex justify-between px-1 sm:hidden" />
                {open && <Dossier cand={p} />}
              </div>
            );
          })}
        </div>
        {/* totals */}
        <div className="mt-2 flex items-center justify-between gap-2 px-2.5 sm:justify-end sm:gap-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 sm:mr-auto">Team totals</span>
          <div className="flex gap-2 sm:gap-2.5">
            <Stat v={totals.pts} k="PPG" strong /><Stat v={totals.trb} k="RPG" strong /><Stat v={totals.ast} k="APG" strong />
            <Stat v={totals.stl} k="SPG" strong /><Stat v={totals.blk} k="BPG" strong />
          </div>
        </div>
        <DexStrip lineupIds={players.map((p) => p.id)} />
      </div>

      <div className="border-t border-zinc-800 px-6 py-4">
        <p className="mb-2.5 text-center text-xs font-medium text-zinc-400">{shareNudge(result)}</p>
        <div className="flex gap-3">
          <ShareButton primary result={result} path={sharePath} names={names} usedHints={usedHints} pickem={hasPickem ? pickem : undefined} prime={prime} blueprint={blueprint} />
          {shared ? (
            <ButtonLink href="/play" variant="secondary" className="flex-1">Build your own five →</ButtonLink>
          ) : (
            <Button variant="secondary" onClick={onReset} className="flex-1">Build Another</Button>
          )}
        </div>
        <SaveCardImage path={sharePath} />
      </div>

      {/* Deep tools sit BELOW Share so the growth loop isn't buried under a wall of analysis.
          Collapsed + lazy-mounted (a cold permalink viewer never fires their /api fetches). */}
      <ExploreZone summary={exploreSummary} onOpen={() => { track("explore_open", { mode: modeKey ?? "shared", grade: result.grade, wins: result.wins }); ev("explore_open", { uid: getUid() }); }}>
        <ScoutingAnchor result={result} />
        {/* What-If Lab: post-commit swap sandbox. Gated off Prime — a candidate's decade there is
            his peak, not the spun era, so the slot pool wouldn't match. Re-scores via /api/evaluate. */}
        {!prime && (
          <WhatIfLab players={players} slots={slots} baseWins={result.wins} baseLosses={result.losses} baseGrade={result.grade} />
        )}
        <CompareLineup players={players} result={result} lineupSeg={lineupSeg} />
      </ExploreZone>
    </div>
  );
}

// hydration-safe Web Share capability (false on server + first client render, then the real value)
const subscribeNoop = () => () => {};
const getCanNative = () => typeof navigator !== "undefined" && "share" in navigator;
const getServerCanNative = () => false;

// Exported so modes with their own result layout (Surgeon) reuse the exact share affordance
// (native share / popover / copy / per-platform links). Pass `text` to override the auto-generated
// copy (the @SweepSeason credit is still appended to every share).
export function ShareButton({ result, path, names, usedHints, pickem, prime, blueprint, text: textOverride, primary }: { result: LineupResult; path: string; names: string[]; usedHints?: boolean; pickem?: PickemProp; prime?: boolean; blueprint?: BlueprintView; text?: string; primary?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyErr, setCopyErr] = useState(false);
  const canNative = useSyncExternalStore(subscribeNoop, getCanNative, getServerCanNative);
  // Defying the crowd is the share-worthy Pick'Em moment — it rewrites the share copy (spec).
  const defyLine = pickem ? pickemShareLine(result.wins, result.losses, pickem, pickem.subject) : null;
  // a real-team comparison gives a recipient with zero context proof the number is basketball,
  // not a random simulator — the highest-leverage moment to pre-frame the engine (B-R verified).
  const shareAnchor = historyAnchor(result.wins);
  const anchorBit = shareAnchor
    ? ` — comparable to the ${shareAnchor.record} ${shareAnchor.team}`
    : ` — Net ${result.netRtg > 0 ? "+" : ""}${result.netRtg.toFixed(1)}`;
  const baseText = textOverride
    ? textOverride
    : defyLine
    ? `${defyLine} Can you beat the crowd on SweepSzn?`
    : blueprint
      // the committed objective is the identity-rich share hook (spec: "I went SPACING BOMB…")
      ? `I went ${blueprint.label} on SweepSzn — ${result.wins}-${result.losses} (${result.label}) with ${blueprint.grade} blueprint execution${usedHints ? " (with hints)" : ""}, board score ${blueprint.score % 1 === 0 ? blueprint.score : blueprint.score.toFixed(1)}. Can you out-execute me?`
      : `My ${prime ? "PRIME cross-era five" : "all-time five"} (${names.join(" · ")}) went ${result.wins}-${result.losses} (${result.label}) on SweepSzn${usedHints ? " (with hints)" : ""}${anchorBit}. Can you build a better one?`;
  // Credit @SweepSeason on every share — a cold viewer who sees a shared result can find the source.
  const text = `${baseText} via @SweepSeason`;
  const url = typeof window !== "undefined" ? new URL(path, window.location.origin).toString() : path;
  const t = encodeURIComponent(text), u = encodeURIComponent(url);

  // close the popover on outside-click or Escape (keyboard + mouse dismissal)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const copy = async () => {
    try { await navigator.clipboard?.writeText(`${text} ${url}`); setCopied(true); track("share", { target: "copy" }); ev("share", { uid: getUid() }); setOpen(false); setTimeout(() => setCopied(false), 1500); }
    catch { setCopyErr(true); setTimeout(() => setCopyErr(false), 2500); }
  };
  const native = async () => {
    try { await (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share?.({ title: "SweepSzn", text, url }); track("share", { target: "native" }); ev("share", { uid: getUid() }); } catch { /* dismissed */ }
  };
  const links: [string, string][] = [
    // No hashtags — the @SweepSeason account posts without them, so user shares stay on-voice.
    ["X", `https://twitter.com/intent/tweet?text=${t}&url=${u}`],
    ["Bluesky", `https://bsky.app/intent/compose?text=${t}%20${u}`],
    ["WhatsApp", `https://wa.me/?text=${t}%20${u}`],
    ["Reddit", `https://www.reddit.com/submit?title=${t}&url=${u}`],
    ["Telegram", `https://t.me/share/url?url=${u}&text=${t}`],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${u}`],
  ];

  return (
    <div className="relative flex-1" ref={ref}>
      <div className="flex gap-1.5">
        <button onClick={() => (canNative ? native() : setOpen((o) => !o))} aria-haspopup={!canNative} aria-expanded={!canNative ? open : undefined} aria-controls={!canNative ? "result-share-panel" : undefined}
          className={`min-w-0 flex-1 rounded-xl py-2.5 text-sm transition ${primary ? "bg-orange-500 font-bold text-black hover:bg-orange-400" : "border border-zinc-700 font-semibold hover:border-zinc-500"}`}>
          {copied ? "Copied!" : copyErr ? "Copy failed" : "Share"}
        </button>
        <a href={links[0][1]} target="_blank" rel="noreferrer" onClick={() => { track("share", { target: "X" }); ev("share", { uid: getUid() }); }}
          aria-label="Post to X" title="Post to X"
          className="grid w-11 shrink-0 place-items-center rounded-xl border border-zinc-700 text-sm font-black hover:border-zinc-500">X</a>
        <a href={links[1][1]} target="_blank" rel="noreferrer" onClick={() => { track("share", { target: "Bluesky" }); ev("share", { uid: getUid() }); }}
          aria-label="Post to Bluesky" title="Post to Bluesky"
          className="grid w-11 shrink-0 place-items-center rounded-xl border border-zinc-700 text-[11px] font-bold hover:border-zinc-500">Bsky</a>
      </div>
      {open && !canNative && (
        <div id="result-share-panel" role="menu" className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-zinc-700 bg-zinc-900 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-full sm:left-0 sm:z-10 sm:mb-2 sm:w-full sm:rounded-xl sm:border sm:p-2 sm:pb-2 sm:shadow-xl">
          {/* grab handle — signals the sheet is a dismissable bottom sheet on mobile */}
          <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-zinc-600 sm:hidden" />
          <button onClick={copy} role="menuitem" className="mb-1 w-full rounded-lg bg-zinc-800 py-2 text-xs font-semibold hover:bg-zinc-700">
            {copied ? "Copied to clipboard!" : copyErr ? "Copy failed — use a link below" : "Copy result"}
          </button>
          <div className="grid grid-cols-3 gap-1">
            {links.map(([name, href]) => (
              <a key={name} href={href} target="_blank" rel="noreferrer" role="menuitem" onClick={() => { track("share", { target: name }); ev("share", { uid: getUid() }); setOpen(false); }}
                className="rounded-lg bg-zinc-800 py-1.5 text-center text-[11px] font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white">{name}</a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Crowd-vs-you strip: split bar + verdict line. Solo votes (no crowd yet — free-play seeds,
// or Redis dark) read as a self-prediction instead of a crowd story.
function PickemStrip({ result, pickem }: { result: LineupResult; pickem: PickemProp }) {
  const v = pickemVerdict(result.wins, pickem);
  if (!v.total && !pickem.vote) return null;
  const yPct = v.total ? Math.round((100 * pickem.y) / v.total) : 0;
  const crowdLabel = (p: "y" | "n") => (p === "y" ? "60+ wins" : "no shot");
  let verdict: string;
  if (v.solo) verdict = `You said ${crowdLabel(pickem.vote!)} — ${v.youRight ? "you called it." : "not this time."}`;
  else if (v.crowd === null) verdict = "The crowd split down the middle.";
  else {
    verdict = `The crowd said ${crowdLabel(v.crowd)} (${v.pct}%) — ${v.crowdRight ? "they were right." : "they were wrong."}`;
    if (v.defied) verdict += " You defied the crowd.";
    else if (v.youRight === true) verdict += " You called it too.";
    else if (v.youRight === false) verdict += v.crowdRight ? " The crowd saw this one coming." : " You went down with them.";
  }
  return (
    <div className="border-t border-zinc-800 px-6 py-4">
      <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-zinc-500">
        <span>🗳️ Pick&apos;Em — crowd vs. you</span>
        {pickem.vote && (
          <span className={pickem.vote === "y" ? "text-green-400" : "text-red-400"}>
            you: {pickem.vote === "y" ? "YES 60+" : "NO"}
          </span>
        )}
      </div>
      {v.total > 0 && (
        <>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-800" role="img"
            aria-label={`Crowd vote: ${yPct}% yes, ${100 - yPct}% no, ${v.total} vote${v.total === 1 ? "" : "s"}`}>
            <div className="bg-green-400/80" style={{ width: `${yPct}%` }} />
            <div className="bg-red-400/80" style={{ width: `${100 - yPct}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
            <span>YES 60+ · {yPct}%</span>
            <span>{v.total} vote{v.total === 1 ? "" : "s"}</span>
            <span>NO · {100 - yPct}%</span>
          </div>
        </>
      )}
      <p className="mt-2 text-sm text-zinc-300">{verdict}</p>
    </div>
  );
}

// Blueprint execution strip: the committed metric, its grade on that axis alone, and the
// composite board score (wins × execution multiplier) — the math shown so the score is legible.
function BlueprintStrip({ result, bp }: { result: LineupResult; bp: BlueprintView }) {
  const gradeColor = GRADE_COLOR[bp.grade] ?? "text-zinc-300";
  return (
    <div className="border-t border-zinc-800 px-6 py-4">
      <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-zinc-500">
        <span>📐 Blueprint — {bp.label}</span>
        <span className={gradeColor}>execution: {bp.grade}</span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <Metric label={bp.metricLabel} value={bp.metricText} color="text-cyan-300" />
        <Metric label="Multiplier" value={`×${bp.mult.toFixed(2)}`} color={gradeColor} />
        <Metric label="Board score" value={`${bp.score % 1 === 0 ? bp.score : bp.score.toFixed(1)}`} color="text-zinc-100" />
      </div>
      <p className="mt-2 text-center text-[11px] text-zinc-500">
        {result.wins} wins × {bp.mult.toFixed(2)} execution = your score on the {bp.label} board
      </p>
    </div>
  );
}

// Post-commit scouting report: your five's projected ORtg/DRtg/Net beside a comparable real team's
// actual ratings (from the win-band anchor). Descriptive — the round is already scored, so juxtaposing
// the engine's own numbers (already shown above) with a real yardstick is fair (DESIGN.md §12).
function ScoutingAnchor({ result }: { result: LineupResult }) {
  const s = scoutingAnchor(result);
  if (!s) return null;
  const rows = [
    { label: "Your five (projected)", ortg: s.est.ortg, drtg: s.est.drtg, net: s.est.netRtg, you: true },
    { label: `${s.anchor.record} ${s.anchor.team} (${s.anchor.season})`, ortg: s.anchor.ortg, drtg: s.anchor.drtg, net: s.anchor.nrtg, you: false },
  ];
  return (
    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">📋 Scouting report</span>
        <span className="text-[10px] text-zinc-600">per 100 possessions</span>
      </div>
      <div className="grid grid-cols-[1fr_3.25rem_3.25rem_3.25rem] gap-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
        <span /><span className="text-right">ORtg</span><span className="text-right">DRtg</span><span className="text-right">Net</span>
      </div>
      <div className="mt-1 space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[1fr_3.25rem_3.25rem_3.25rem] items-center gap-1 text-[11px] tabular-nums">
            <span className={`truncate ${r.you ? "font-semibold text-zinc-200" : "text-zinc-400"}`}>{r.label}</span>
            <span className="text-right text-zinc-300">{r.ortg.toFixed(1)}</span>
            <span className="text-right text-zinc-300">{r.drtg.toFixed(1)}</span>
            <span className={`text-right ${r.net >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtNet(r.net)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-zinc-600">
        Your five&apos;s engine projection beside {s.anchor.team}&apos;s actual {s.anchor.season} ratings — a real-history yardstick, not a fit score.
      </p>
    </div>
  );
}

function Metric({ label, value, color = "text-zinc-200", title }: { label: string; value: string; color?: string; title?: string }) {
  return (
    <div title={title} className="rounded-lg bg-zinc-800/60 px-3 py-1.5">
      <span className="text-zinc-500">{label} </span><b className={`tabular-nums ${color}`}>{value}</b>
    </div>
  );
}

// Compact grade scale (F → S) with the current tier highlighted and a "2 wins from B" nudge
// when the next boundary is close. Boundaries come from the engine's WIN_GRADES — never redefined.
function GradeLadder({ wins, grade }: { wins: number; grade: string }) {
  const asc = [...WIN_GRADES].reverse(); // F → S
  const next = asc.find((g) => g.min > wins);
  return (
    <div className="mt-3">
      <div className="flex items-center justify-center gap-1" role="list" aria-label="Grade scale, F to S">
        {asc.map((g) => (
          <span key={g.grade} role="listitem" aria-current={g.grade === grade ? "true" : undefined}
            title={`${g.label} — ${g.min}+ wins`}
            aria-label={g.grade === grade ? `${g.grade} — ${g.label}, your grade` : `${g.grade} — ${g.label}`}
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
              g.grade === grade ? `${GRADE_COLOR[g.grade] ?? "text-zinc-200"} bg-zinc-800` : "text-zinc-600"}`}>
            {g.grade}
          </span>
        ))}
      </div>
      {next && next.min - wins <= 5 && (
        <p className="mt-1 text-[11px] text-zinc-500">
          {next.grade === "S"
            // the draftable ceiling is 79 — "1 win from S" would taunt an impossible chase
            ? "S (80+) is theoretical — no draftable five has reached it"
            : `${next.min - wins} win${next.min - wins === 1 ? "" : "s"} from ${next.grade} (${next.label})`}
        </p>
      )}
    </div>
  );
}

// Per-player rating contributions behind the Star offense/defense factors. This is the single
// most common confusion fix: a defensive anchor's NEGATIVE offensive impact silently drags
// "Star offense" — surfacing the per-player split turns "engine is broken" into "real tradeoff".
function StarContrib({ rows, side }: { rows: ContribRow[]; side: "off" | "def" }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-zinc-600 hover:text-zinc-400">
        Per-player impact
      </summary>
      <div className="mt-1 space-y-0.5">
        {rows.map((r) => {
          const v = side === "off" ? r.offPts : r.defPts;
          return (
            <div key={r.id} className="flex items-center justify-between text-[11px]">
              <span className="truncate text-zinc-400">{displayName(r.name)}</span>
              <span className={`shrink-0 tabular-nums font-semibold ${v < 0 ? "text-amber-400" : "text-zinc-300"}`}>
                {v > 0 ? "+" : ""}{v.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-1 text-[10px] leading-snug text-zinc-600">Engine impact on this lineup — not a career grade.</p>
    </details>
  );
}

function FactorColumn({ title, items, kind, contrib }: { title: string; items: ReturnType<typeof factorViews>; kind: "good" | "bad"; contrib?: ContribRow[] }) {
  const color = kind === "good" ? "text-green-400" : "text-red-400";
  return (
    <div>
      <div className={`mb-2 border-l-2 pl-2 text-xs font-bold uppercase tracking-wide ${kind === "good" ? "border-green-400 text-green-400" : "border-red-400 text-red-400"}`}>{title}</div>
      {items.length === 0 && (
        <div className="text-xs text-zinc-500">{kind === "bad" ? "No major weaknesses — a clean, balanced build." : "—"}</div>
      )}
      <div className="space-y-2">
        {items.map((f, i) => {
          const starSide = f.label === "Star offense" ? "off" : f.label === "Star defense" ? "def" : null;
          return (
            <div key={i}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-zinc-300">{f.label}</span>
                <span className={`shrink-0 tabular-nums font-semibold ${color}`}>
                  {f.value > 0 ? "+" : ""}{f.value.toFixed(1)}
                  {f.winsEst != null && Math.abs(f.winsEst) >= 1 && (
                    <span className="ml-1 font-normal text-zinc-500" title="Exact win effect for this five — record with this factor vs. without it">
                      (~{f.winsEst > 0 ? "+" : "-"}{Math.abs(f.winsEst)} win{Math.abs(f.winsEst) === 1 ? "" : "s"})
                    </span>
                  )}
                </span>
              </div>
              <div className="text-[11px] leading-snug text-zinc-500">{f.blurb}</div>
              {starSide && contrib && contrib.length > 0 && <StarContrib rows={contrib} side={starSide} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ROLE_BARS = [
  { key: "shoot", label: "Spacing", tint: "bg-amber-400" },
  { key: "rimScore", label: "Rim", tint: "bg-violet-400" },
  { key: "perimScore", label: "Perim D", tint: "bg-cyan-400" },
] as const;

function RoleBars({ pb }: { pb: PlayerBreakdown }) {
  if (!ROLE_BARS.some((b) => (pb[b.key] ?? 0) > 0.05)) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      {ROLE_BARS.map((b) => {
        const v = Math.max(0, Math.min(1, pb[b.key] ?? 0));
        return (
          <div key={b.key} role="img" aria-label={`${b.label}: ${Math.round(v * 100)} out of 100`}
            className="flex items-center gap-1.5" title={`${b.label} — engine score ${Math.round(v * 100)} / 100`}>
            <span className="text-[8px] font-semibold uppercase tracking-wide text-zinc-600">{b.label}</span>
            <div className="h-1 w-8 overflow-hidden rounded-full bg-zinc-800">
              <div className={`h-full rounded-full ${b.tint}`} style={{ width: `${Math.round(v * 100)}%` }} />
            </div>
          </div>
        );
      })}
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
      <div className="text-[8px] uppercase tracking-wide text-zinc-500">{k}</div>
    </div>
  );
}
