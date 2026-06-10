"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CandidateFit, DraftCandidate, DraftStep, LineupResult, Player, Slot } from "@/lib/types";
import { SLOTS, FRANCHISES, DECADES, teamColors, teamName, initials, displayName, eraLabel } from "@/lib/teams";
import { track } from "@vercel/analytics";
import { ev } from "@/lib/ev";
import { getUid } from "@/lib/streak";
import ResultCard from "@/components/ResultCard";
import Leaderboard from "@/components/Leaderboard";
import ChallengeResult from "@/components/ChallengeResult";
import ChallengeOwner from "@/components/ChallengeOwner";
import ResultsHistory from "@/components/ResultsHistory";
import { newChallengeId, challengeSeed } from "@/lib/challenge";
import { encodeLineup, decodeShare } from "@/lib/share";
import { saveResult, writeLastResult, readLastResult } from "@/lib/resultHistory";
import { pickemSeedOk, getPickemSkip, setPickemSkip, getLocalVote, setLocalVote, type PickemVote } from "@/lib/pickem";
import { buildFhChoices } from "@/lib/factorHunt";
import FhLeaderboard from "@/components/FhLeaderboard";

type Mode = "daily" | "classic" | "hoopiq" | "challenge" | "factorhunt";
type Roster = Record<Slot, DraftCandidate | null>;
const EMPTY: Roster = { PG: null, SG: null, SF: null, PF: null, C: null };
interface Spin { team: string; decade: string; candidates: DraftCandidate[] }
type SpinOpts = { lockedTeam?: string; lockedDecade?: string; excludeTeam?: string; excludeDecade?: string; salt?: number };
// The full current result kept in localStorage for a same-session refresh (carries the draft trace
// plus, for Factor Hunt, the locked prediction so the verdict chip survives a refresh).
type LastResult = { mode: Mode; seed: string; result: { result: LineupResult; players: Player[]; trace: DraftStep[]; usedHints: boolean }; fh?: string | null };

// court slot positions (% of the half-court panel; basket at top)
const COURT: Record<Slot, { left: number; top: number }> = {
  C: { left: 34, top: 21 }, PF: { left: 62, top: 21 },
  SF: { left: 15, top: 49 }, SG: { left: 79, top: 49 }, PG: { left: 47, top: 68 },
};

function todaySeed() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}
const rand = () => Math.floor(Math.random() * 1e9);

// Hints are a limited resource: this many assisted picks per game (Classic only), so the engine's
// fit grade can't be used to mindlessly auto-pick all five. Tune here (1 = strict, 3 = friendly).
const HINT_BUDGET = 2;

export default function Game() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [seed, setSeed] = useState("");
  const [roster, setRoster] = useState<Roster>(EMPTY);
  const [current, setCurrent] = useState<Spin | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [reel, setReel] = useState<{ team: string; era: string }>({ team: "ATL", era: "60's" });
  const [lockedReel, setLockedReel] = useState<"team" | "era" | null>(null);
  const [selPlayer, setSelPlayer] = useState<DraftCandidate | null>(null);
  const [selSlot, setSelSlot] = useState<Slot | null>(null);
  const [skips, setSkips] = useState({ team: false, era: false });
  const [result, setResult] = useState<{ result: LineupResult; players: Player[]; trace: DraftStep[]; usedHints: boolean } | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [challengeRole, setChallengeRole] = useState<"create" | "respond" | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null); // viewing a challenge I created (restored from URL or opened from "Your results")
  const [restoring, setRestoring] = useState(false);           // briefly true while a refresh rebuilds a finished result
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Hints are OFF by default for everyone, every session, every pick — never persisted. In Classic you
  // spend a hint to REVEAL the engine's fit grades for the current pick (HINT_BUDGET per game). Revealing
  // charges immediately, so there's no "peek, then toggle off, then pick" to dodge the cost.
  const [hintsUsed, setHintsUsed] = useState(0);   // hints spent this game (UI mirror of the ref)
  const hintsUsedRef = useRef(0);                  // synchronous count, read at simulate time
  const saltRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const traceRef = useRef<DraftStep[]>([]);            // ordered picks for leaderboard verification
  const roundRespinsRef = useRef<("team" | "era")[]>([]); // re-spins used in the current round
  const [convertedId, setConvertedId] = useState<string | null>(null); // challenge minted from a finished game
  const abortSimRef = useRef<AbortController | null>(null);             // cancels an in-flight simulate on restart
  const sheetRef = useRef<HTMLDivElement>(null);                        // mobile "choose position" dialog
  // Pick'Em: one-tap crowd vote locked after the first reels settle, settled on the result card.
  const [pickemVote, setPickemVote] = useState<PickemVote | null>(null);
  const [pickemDismissed, setPickemDismissed] = useState(false);        // voted or skipped THIS game
  const [pickemCrowd, setPickemCrowd] = useState<{ y: number; n: number } | null>(null);
  const [pickemSubject, setPickemSubject] = useState<string | null>(null); // "the 1970s Knicks" — captured at vote time for share copy
  const pickemRef = useRef<HTMLDivElement>(null);                       // vote overlay dialog
  // Factor Hunt: prediction step between "five locked" and the reveal.
  const [fhStep, setFhStep] = useState<{ roster: Roster; ask: "worst" | "best"; choices: string[] } | null>(null);
  const [fhPick, setFhPick] = useState<string | null>(null);            // highlighted choice (not yet locked)
  const [fhPrediction, setFhPrediction] = useState<string | null>(null); // locked choice (null = skipped)
  const fhFetchingRef = useRef(false);                                  // de-dupes the choices fetch
  const fhAbortRef = useRef<AbortController | null>(null);              // cancels an in-flight choices fetch on restart
  const fhRef = useRef<HTMLDivElement>(null);                           // prediction dialog

  // Spend a hint to reveal fit grades for the current pick. Charges on reveal (not on placement), so
  // there is no way to peek and then dodge the cost. No-op once the per-game budget is spent.
  const revealHint = useCallback(() => {
    if (mode !== "classic" || hintsUsedRef.current >= HINT_BUDGET) return;
    hintsUsedRef.current += 1; setHintsUsed(hintsUsedRef.current);
  }, [mode]);

  const drafted = useMemo(() => SLOTS.map((s) => roster[s]).filter(Boolean) as DraftCandidate[], [roster]);
  const filled = drafted.length;
  const allFilled = filled === 5;
  const roundNum = Math.min(filled + 1, 5);
  const openSlots = useMemo(() => SLOTS.filter((s) => !roster[s]), [roster]);

  const start = useCallback((m: Mode, challenge?: { id: string; role: "create" | "respond"; seed?: string }) => {
    track("mode_start", { mode: m });
    ev("play", { uid: getUid(), mode: m });
    abortSimRef.current?.abort(); abortSimRef.current = null; // cancel any in-flight simulate
    fhAbortRef.current?.abort(); fhAbortRef.current = null;   // and any in-flight FH choices fetch
    setMode(m);
    let cid: string | null = null;
    let crole: "create" | "respond" | null = null;
    let s: string;
    if (m === "challenge") {
      cid = challenge?.id ?? newChallengeId();
      crole = challenge?.role ?? "create";
      s = challenge?.seed ?? challengeSeed(cid); // a converted/legacy challenge replays its own carried seed
    } else {
      // daily + factorhunt share one deterministic seed per UTC day; free-play modes roll fresh
      s = m === "daily" ? `daily-${todaySeed()}` : m === "factorhunt" ? `fh-${todaySeed()}` : `${m}-${rand()}`;
    }
    setChallengeId(cid); setChallengeRole(crole); setSeed(s);
    setRoster(EMPTY); setCurrent(null); setResult(null); setError(null); setLoading(false);
    setSelPlayer(null); setSelSlot(null); setSkips({ team: false, era: false });
    setReel({ team: "ATL", era: "60's" }); setLockedReel(null); saltRef.current = 0;
    traceRef.current = []; roundRespinsRef.current = []; setConvertedId(null);
    hintsUsedRef.current = 0; setHintsUsed(0);
    setPickemVote(null); setPickemDismissed(false); setPickemCrowd(null); setPickemSubject(null);
    setFhStep(null); setFhPick(null); setFhPrediction(null); fhFetchingRef.current = false;
    setOwnerId(null);
    // a new game owns the URL — drop any restore params so a later refresh won't resurrect an old screen
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("r") || u.searchParams.has("m") || u.searchParams.has("own") || u.searchParams.has("d")) {
        u.searchParams.delete("r"); u.searchParams.delete("m"); u.searchParams.delete("own"); u.searchParams.delete("d");
        window.history.replaceState(null, "", u.pathname + u.search + u.hash);
      }
    } catch { /* no history API */ }
  }, []);

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current); }, []);

  // move keyboard focus into the mobile position sheet when it opens, and restore it to the
  // triggering element when it closes (paired with the Tab trap in the sheet's onKeyDown below)
  useEffect(() => {
    if (!(selPlayer || selSlot)) return;
    const prev = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    return () => prev?.focus?.();
  }, [selPlayer, selSlot]);

  // Bootstrap the view from the URL (hold-your-place restore on refresh). Priority: a joiner deep link
  // (?c=<id>) → respond mode; then a creator dashboard (?own=<id>); then a finished-result restore
  // (?r=<encoded>&m=<mode>). A bare URL falls through to the mode picker. (async IIFE keeps start()'s
  // setState out of the effect body for react-hooks/set-state-in-effect.)
  useEffect(() => {
    let cancelled = false;
    const idRe = /^[a-z0-9]{6,16}$/;
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const cid = params.get("c");
        if (cid && idRe.test(cid)) {
          // fetch the challenge's draft seed so respond mode replays the SAME spins the creator faced
          // (a daily/classic-originated challenge does NOT use the h2h-<id> default seed)
          let seedOverride: string | undefined;
          try {
            const r = await fetch(`/api/challenge/${cid}`);
            if (r.ok) { const info = await r.json(); if (typeof info?.seed === "string") seedOverride = info.seed; }
          } catch { /* offline — fall back to the h2h-<id> default below */ }
          if (cancelled) return; // effect re-ran (or unmounted) while the seed fetch was in flight
          start("challenge", { id: cid, role: "respond", seed: seedOverride });
          params.delete("c");
          const qs = params.toString();
          window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
          return;
        }

        const own = params.get("own");
        if (own && idRe.test(own)) { if (!cancelled) setOwnerId(own); return; }

        const enc = params.get("r");
        const m = params.get("m") as Mode | null;
        if (enc && (m === "daily" || m === "classic" || m === "hoopiq" || m === "factorhunt")) {
          setRestoring(true);
          // same-session full restore: keeps the draft trace the Daily board needs to submit
          const last = readLastResult<LastResult>();
          if (last && last.mode === m && last.result && encodeLineup(last.result.players.map((p) => p.id), last.result.usedHints) === enc) {
            if (cancelled) return;
            setMode(m); setSeed(last.seed); setResult(last.result); setFhPrediction(last.fh ?? null); setRestoring(false); return;
          }
          // cold restore (other device / cleared storage): rebuild from the five's ids. No trace, so the
          // Daily leaderboard renders read-only (still shows your standing, just no re-submit).
          const { ids, hinted } = decodeShare(enc);
          if (ids.length !== 5 || new Set(ids).size !== 5) { if (!cancelled) setRestoring(false); return; }
          try {
            const res = await fetch("/api/evaluate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
            if (!res.ok) throw new Error("evaluate failed");
            const data = await res.json();
            if (cancelled) return;
            // daily/FH boards are per-date — use the date carried in the URL so a cold restore shows
            // the result's own day (read-only), not today's empty board. Fall back to today if absent/bad.
            const d = params.get("d");
            const dailyDate = d && /^\d{4}-\d{1,2}-\d{1,2}$/.test(d) ? d : todaySeed();
            setMode(m); setSeed(m === "daily" ? `daily-${dailyDate}` : m === "factorhunt" ? `fh-${dailyDate}` : `${m}-restored`);
            setResult({ result: data.result, players: data.players, trace: [], usedHints: hinted });
          } catch { /* leave on the mode picker */ }
          finally { if (!cancelled) setRestoring(false); }
        }
      } catch { /* no query / no history API */ }
    })();
    return () => { cancelled = true; };
  }, [start]);

  // Hold-your-place: while a finished result is on screen, mirror it into the URL (?r=&m=) so a refresh
  // restores it. Challenge mode owns the URL via ?own=<id> (set by ChallengeOwner), so it's skipped here.
  useEffect(() => {
    if (!result || !mode || mode === "challenge") return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("r", encodeLineup(result.players.map((p) => p.id), result.usedHints));
      u.searchParams.set("m", mode);
      // daily/FH boards are per-date — carry the date so a cold restore shows the right day's board, not today's
      if (mode === "daily") u.searchParams.set("d", seed.replace("daily-", ""));
      else if (mode === "factorhunt") u.searchParams.set("d", seed.replace("fh-", ""));
      else u.searchParams.delete("d");
      u.searchParams.delete("c"); u.searchParams.delete("own");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch { /* no history API */ }
  }, [result, mode, seed]);

  const runSpin = useCallback(async (opts: SpinOpts, locked: "team" | "era" | null = null) => {
    if (spinning) return;
    setError(null); setSpinning(true); setCurrent(null); setSelPlayer(null); setSelSlot(null); setLockedReel(locked);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setReel({
        team: locked === "team" ? opts.lockedTeam! : FRANCHISES[Math.floor(Math.random() * FRANCHISES.length)],
        era: locked === "era" ? eraLabel(opts.lockedDecade!) : eraLabel(DECADES[Math.floor(Math.random() * DECADES.length)]),
      });
    }, 70);
    try {
      const r = await fetch("/api/spin", {
        method: "POST", headers: { "content-type": "application/json" },
        // fit grades are a Classic-only assist; only Classic free-play requests them (keeps them off
        // the wire in Daily/HoopIQ/Challenge so the network response can't be read to draft optimally)
        body: JSON.stringify({ seed, round: filled, exclude: drafted.map((p) => p.id), fit: mode === "classic", ...opts }),
      });
      if (!r.ok) throw new Error("spin failed");
      const res: Spin = await r.json();
      await new Promise((rs) => setTimeout(rs, 1100));
      setReel({ team: res.team, era: eraLabel(res.decade) });
      setCurrent(res);
    } catch {
      setLockedReel(null); setReel({ team: "ATL", era: "60's" });
      // roll back the re-spin we optimistically charged before this call so a network error doesn't
      // silently burn the skip (and don't leave a phantom re-spin in the verification trace)
      if (locked === "era") setSkips((s) => ({ ...s, team: false }));
      else if (locked === "team") setSkips((s) => ({ ...s, era: false }));
      // also roll back the pre-incremented salt — the next successful re-spin must reuse this salt
      // value, or verifyTrace (which counts only the re-spins in the trace) would reject the submit.
      if (locked !== null) { roundRespinsRef.current = roundRespinsRef.current.slice(0, -1); saltRef.current--; }
      setError("Network hiccup — tap SPIN to try again.");
    } finally {
      if (tickRef.current) clearInterval(tickRef.current);
      setSpinning(false);
    }
  }, [spinning, seed, filled, drafted, mode]);

  const spin = useCallback(() => runSpin({}), [runSpin]);

  // Pick'Em handlers. The vote is optimistic-local first (works even when Redis is dark) and
  // fire-and-forget to /api/pickem; X (or Escape) skips AND remembers the preference (spec).
  const votePickem = useCallback((v: PickemVote) => {
    setPickemVote(v); setPickemDismissed(true); setLocalVote(seed, v);
    setPickemSubject(current ? `the ${current.decade} ${teamName(current.team)}` : null);
    track("pickem_vote", { vote: v });
    fetch("/api/pickem", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ seed, vote: v, uid: getUid() }),
    }).catch(() => { /* self-disabled or offline — the local vote still settles on the card */ });
  }, [seed, current]);
  const skipPickem = useCallback(() => { setPickemDismissed(true); setPickemSkip(); track("pickem_skip"); }, []);
  const reSpinTeam = useCallback(() => {
    if (skips.team || !current) return;
    setSkips((s) => ({ ...s, team: true }));
    roundRespinsRef.current.push("team");
    runSpin({ lockedDecade: current.decade, excludeTeam: current.team, salt: ++saltRef.current }, "era");
  }, [skips.team, current, runSpin]);
  const reSpinEra = useCallback(() => {
    if (skips.era || !current) return;
    setSkips((s) => ({ ...s, era: true }));
    roundRespinsRef.current.push("era");
    runSpin({ lockedTeam: current.team, excludeDecade: current.decade, salt: ++saltRef.current }, "team");
  }, [skips.era, current, runSpin]);

  const simulate = useCallback(async (r: Roster, fhPred: string | null = null) => {
    abortSimRef.current?.abort();
    const ctrl = new AbortController();
    abortSimRef.current = ctrl;
    setLoading(true); setError(null);
    try {
      const ids = SLOTS.map((s) => r[s]?.id);
      const res = await fetch("/api/evaluate", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }), signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("evaluate failed");
      const data = await res.json();
      // abort() can't interrupt the body parse once the response has landed — re-check before
      // committing, or a Restart racing the parse would stamp the OLD game's result onto the new one
      if (ctrl.signal.aborted) return;
      const full = { result: data.result, players: data.players as Player[], trace: [...traceRef.current], usedHints: hintsUsedRef.current > 0 };
      setResult(full);
      // Persist so the result survives a refresh (full object, incl. trace) and shows under "Your
      // results". A challenge entry is upgraded with its challengeId later, when the link is created.
      writeLastResult({ mode, seed, result: full, fh: fhPred });
      if (mode) saveResult({ encoded: encodeLineup(full.players.map((p) => p.id), full.usedHints), mode, wins: data.result.wins, losses: data.result.losses, grade: data.result.grade });
      track("lineup_complete", { wins: data.result.wins, grade: data.result.grade });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // superseded by a restart — ignore
      setError("Couldn't simulate the season — tap Simulate to retry.");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [mode, seed]);

  // Factor Hunt prediction step: fetch the choice set (server-built — only {ask, choices} is on
  // the wire, never the answer or the record), then hold the reveal until the player locks/skips.
  // Any failure falls straight through to a normal reveal with no bonus — never blocks the game.
  const beginFhPrediction = useCallback(async (r: Roster) => {
    if (fhFetchingRef.current) return;
    fhFetchingRef.current = true; setError(null);
    // abortable: a Restart mid-fetch must not resurrect the old game's prediction dialog (success
    // path) or fall through to a stale simulate() carrying the old mode/seed (failure path)
    fhAbortRef.current?.abort();
    const ctrl = new AbortController();
    fhAbortRef.current = ctrl;
    try {
      const ids = SLOTS.map((s) => r[s]?.id);
      const res = await fetch("/api/factorhunt/choices", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids, seed }), signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("choices failed");
      const d = await res.json();
      if (ctrl.signal.aborted) return; // restarted while the body was parsing — drop everything
      if ((d?.ask === "worst" || d?.ask === "best") && Array.isArray(d?.choices)
        && d.choices.length >= 2 && d.choices.every((x: unknown) => typeof x === "string")) {
        setFhPick(null); setFhStep({ roster: r, ask: d.ask, choices: d.choices });
        return;
      }
      throw new Error("bad choices");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // restarted — not a failure
      if (ctrl.signal.aborted) return;
      simulate(r, null); // graceful: reveal without a prediction, no bonus
    } finally { fhFetchingRef.current = false; }
  }, [seed, simulate]);

  const lockFh = useCallback((choice: string | null) => {
    if (!fhStep) return;
    const r = fhStep.roster;
    setFhPrediction(choice); setFhStep(null); setFhPick(null);
    track("fh_predict", { locked: choice ? 1 : 0 });
    simulate(r, choice);
  }, [fhStep, simulate]);

  // Mode fork at "five locked": Factor Hunt detours through the prediction step; everyone else
  // simulates immediately (the pre-FH behavior, byte-for-byte).
  const finishDraft = useCallback((r: Roster) => {
    if (mode === "factorhunt") beginFhPrediction(r);
    else simulate(r);
  }, [mode, beginFhPrediction, simulate]);

  const place = useCallback((slot: Slot) => {
    if (!selPlayer || roster[slot] || !selPlayer.eligible.includes(slot)) return;
    traceRef.current.push({ slot, pickedId: selPlayer.id, respins: [...roundRespinsRef.current] });
    roundRespinsRef.current = [];
    const next = { ...roster, [slot]: selPlayer };
    setRoster(next); setSelPlayer(null); setCurrent(null); setLockedReel(null);
    if (SLOTS.every((s) => next[s])) finishDraft(next);
  }, [selPlayer, roster, finishDraft]);

  const canSwap = useCallback((a: Slot, b: Slot) => {
    if (a === b) return false;
    const pa = roster[a], pb = roster[b];
    return (!pa || pa.eligible.includes(b)) && (!pb || pb.eligible.includes(a));
  }, [roster]);

  const clickSlot = useCallback((slot: Slot) => {
    if (selPlayer) {
      if (!roster[slot] && selPlayer.eligible.includes(slot)) place(slot);
      else setSelPlayer(null); // tapping an invalid slot cancels the selection
      return;
    }
    if (selSlot) {
      if (canSwap(selSlot, slot)) setRoster((r) => ({ ...r, [slot]: r[selSlot], [selSlot]: r[slot] }));
      setSelSlot(null);
      return;
    }
    if (roster[slot]) setSelSlot(slot); // pick up to move/swap
  }, [selPlayer, selSlot, roster, place, canSwap]);

  // is `slot` a valid target for the current selection? (drives the orange glow)
  const slotTarget = useCallback((slot: Slot): boolean => {
    if (selPlayer) return !roster[slot] && selPlayer.eligible.includes(slot);
    if (selSlot) return canSwap(selSlot, slot);
    return false;
  }, [selPlayer, selSlot, roster, canSwap]);

  // Pick'Em overlay gate: first reels settled, nothing drafted yet, a votable seed, not yet
  // voted/skipped (this game, this seed via localStorage, or for good via the skip preference).
  const showPickem = !!current && filled === 0 && mode !== "challenge" && mode !== null &&
    !pickemDismissed && !pickemVote && pickemSeedOk(seed) && !getPickemSkip() && !getLocalVote(seed);

  // Vote overlay focus management (same pattern as the mobile position sheet above).
  useEffect(() => {
    if (!showPickem) return;
    const prev = document.activeElement as HTMLElement | null;
    pickemRef.current?.focus();
    return () => prev?.focus?.();
  }, [showPickem]);

  // Factor Hunt prediction dialog focus management (same pattern).
  useEffect(() => {
    if (!fhStep) return;
    const prev = document.activeElement as HTMLElement | null;
    fhRef.current?.focus();
    return () => prev?.focus?.();
  }, [fhStep]);

  // Once the record is in, pull the crowd split (and your stored vote — e.g. a Daily replay
  // from another device) for the crowd-vs-you strip. Best-effort: a 503 (Redis absent) or a
  // network error just leaves the strip off / local-vote-only.
  useEffect(() => {
    if (!result || mode === "challenge" || !pickemSeedOk(seed)) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/pickem?seed=${encodeURIComponent(seed)}&uid=${encodeURIComponent(getUid())}`);
        if (!r.ok || cancelled) return;
        const d = await r.json();
        if (cancelled) return;
        setPickemCrowd({ y: Number(d?.y) || 0, n: Number(d?.n) || 0 });
        const sv: PickemVote | null = d?.vote === "y" || d?.vote === "n" ? d.vote : null;
        if (sv) setPickemVote((p) => p ?? sv);
      } catch { /* crowd strip stays off */ }
    })();
    return () => { cancelled = true; };
  }, [result, mode, seed]);

  if (restoring) return <div className="mx-auto max-w-4xl px-4 py-24 text-center text-sm text-zinc-400 animate-pulse">Loading your result…</div>;
  if (!mode) {
    if (ownerId) return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <button onClick={() => { setOwnerId(null); try { const u = new URL(window.location.href); u.searchParams.delete("own"); window.history.replaceState(null, "", u.pathname + u.search + u.hash); } catch { /* no history API */ } }}
          className="mb-4 text-sm text-zinc-400 hover:text-zinc-200">← All modes</button>
        <ChallengeOwner id={ownerId} />
      </div>
    );
    return <ModeSelect onPick={start} onOpenChallenge={(cid) => setOwnerId(cid)} />;
  }
  // Pick'Em crowd-vs-you strip data for the result card (vote falls back to the per-seed local
  // copy so a Daily replay in the same browser still shows your pick when the API is dark).
  const effPickemVote = pickemVote ?? (pickemSeedOk(seed) ? getLocalVote(seed) : null);
  const pickemView = mode !== "challenge" && (effPickemVote || pickemCrowd)
    ? { y: pickemCrowd?.y ?? 0, n: pickemCrowd?.n ?? 0, vote: effPickemVote, subject: pickemSubject }
    : undefined;
  // Factor Hunt verdict chip: recompute the answer from the revealed factors (same pure helper
  // the server verifies with, so the chip and the board bonus can never disagree).
  const fhView = (() => {
    if (mode !== "factorhunt" || !result || !fhPrediction) return undefined;
    const c = buildFhChoices(result.result.factors, seed);
    return c ? { prediction: fhPrediction, answer: c.answer, correct: fhPrediction === c.answer } : undefined;
  })();
  if (result) return (
    <Shell roundNum={roundNum} mode={mode} onRestart={() => start(mode)} showRestart>
      <ResultCard result={result.result} players={result.players} slots={SLOTS} mode={mode === "factorhunt" ? "Factor Hunt" : mode} usedHints={result.usedHints} onReset={() => start(mode)} pickem={pickemView} factorHunt={fhView} />
      {mode === "daily" && <Leaderboard date={seed.replace("daily-", "")} trace={result.trace} usedHints={result.usedHints} readOnly={result.trace.length === 0} />}
      {mode === "factorhunt" && <FhLeaderboard date={seed.replace("fh-", "")} trace={result.trace} prediction={fhPrediction} readOnly={result.trace.length === 0} />}
      {mode === "challenge" && challengeId && challengeRole && (
        <ChallengeResult id={challengeId} role={challengeRole} seed={seed} usedHints={false} result={result.result} players={result.players}
          trace={result.trace} onCreateOwn={() => start("challenge")} />
      )}
      {/* FH seeds can't convert to H2H challenges (the challenge store only accepts daily/classic/
          hoopiq game seeds), so the convert CTA is hidden there rather than 400ing on click. */}
      {mode !== "challenge" && mode !== "factorhunt" && (convertedId ? (
        // Convert THIS finished five into a real H2H challenge in place, carrying the original seed:
        // the friend drafts the same teams/eras and tries to beat this exact record — no re-draft.
        <ChallengeResult id={convertedId} role="create" seed={seed} usedHints={result.usedHints}
          result={result.result} players={result.players} trace={result.trace} />
      ) : (
        <button onClick={() => setConvertedId(newChallengeId())}
          className="mt-4 w-full rounded-xl border border-orange-500/50 bg-orange-500/10 py-3 text-sm font-bold text-orange-300 hover:bg-orange-500/20">
          ⚔️ Challenge a friend to beat this
        </button>
      ))}
    </Shell>
  );
  if (loading) return (
    <Shell roundNum={5} mode={mode} onRestart={() => start(mode)} showRestart>
      <div className="py-24 text-center text-sm text-zinc-400 animate-pulse">Simulating season…</div>
    </Shell>
  );

  const canPlaceAny = current ? current.candidates.some((c) => openSlots.some((s) => c.eligible.includes(s))) : true;
  const hideIQ = mode === "hoopiq";
  const reelMasked = (locked: boolean) => hideIQ && !(spinning && !locked);

  return (
    <Shell roundNum={roundNum} mode={mode} onRestart={() => start(mode)} showRestart={filled > 0 || !!current}>
      {/* reels */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Reel kind="TEAM" value={reel.team} sub={teamName(reel.team)} color="orange" locked={lockedReel === "team"} masked={reelMasked(lockedReel === "team")} spinning={spinning || !current} />
        <Reel kind="ERA" value={reel.era} sub="decade" color="violet" locked={lockedReel === "era"} masked={reelMasked(lockedReel === "era")} spinning={spinning || !current} />
        {!current && (
          <button onClick={spin} disabled={spinning}
            className="rounded-xl bg-orange-500 px-7 py-3 text-base font-black text-black shadow-lg transition hover:bg-orange-400 disabled:opacity-50">
            {spinning ? "Spinning…" : "🎰 SPIN"}
          </button>
        )}
      </div>
      {hideIQ && (
        <p className="mt-2 text-center text-[11px] text-zinc-500">🧠 Team &amp; era hidden — draft by recognizing the players.</p>
      )}
      {(current || spinning) && (
        <div className="mt-2 flex justify-center gap-2 text-xs">
          <SkipBtn label="↻ Re-spin Team" used={skips.team} onClick={reSpinTeam} disabled={spinning} />
          <SkipBtn label="↻ Re-spin Era" used={skips.era} onClick={reSpinEra} disabled={spinning} />
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_minmax(300px,380px)]">
        {/* candidate browser (first on mobile + desktop-left) */}
        <div className="order-first">
          {current ? (
            <Browser key={`${current.team}|${current.decade}|${roundNum}`} spin={current} mode={mode} selId={selPlayer?.id ?? null}
              hintsLeft={Math.max(0, HINT_BUDGET - hintsUsed)} onReveal={revealHint}
              canPlace={(c) => openSlots.some((s) => c.eligible.includes(s))}
              onSelect={(c) => { setSelSlot(null); setSelPlayer((p) => (p?.id === c.id ? null : c)); }} />
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center">
              {allFilled ? (
                <>
                  <p className="mb-3 text-sm text-zinc-400">Your starting five is set.</p>
                  <button onClick={() => finishDraft(roster)} disabled={loading}
                    className="rounded-xl bg-green-500 px-6 py-2.5 font-bold text-black hover:bg-green-400 disabled:opacity-50">
                    {mode === "factorhunt" ? "Lock Five → Predict" : "Simulate Season"}
                  </button>
                </>
              ) : (
                <p className="text-sm text-zinc-500">{filled === 0 ? "Spin to draft your first player." : `Spin for round ${roundNum} of 5.`}</p>
              )}
              {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
            </div>
          )}
          {current && !canPlaceAny && (
            <div className="mt-3 rounded-lg border border-amber-600/40 bg-amber-500/10 p-3 text-center text-xs text-amber-400">
              No one here fits your open slot ({openSlots.join("/")}).{" "}
              <button onClick={spin} className="font-bold underline">Spin again</button>
            </div>
          )}
        </div>

        {/* court (below candidates on mobile, right on desktop) */}
        <div className="order-last">
          <Court roster={roster} selSlot={selSlot} isTarget={slotTarget} onSlot={clickSlot} maskColors={hideIQ} />
          {selPlayer && (
            <p role="status" aria-live="polite" className="mt-2 hidden text-center text-xs font-semibold text-orange-400 lg:block">
              Placing {displayName(selPlayer.name)} — tap a glowing position
            </p>
          )}
          {selSlot && (
            <p role="status" aria-live="polite" className="mt-2 hidden text-center text-xs font-semibold text-orange-400 lg:block">
              Moving {displayName(roster[selSlot]!.name)} — tap a glowing slot to swap
            </p>
          )}
        </div>
      </div>

      {/* mobile "choose position" sheet (82-0 parity) */}
      {(selPlayer || selSlot) && (
        <div ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Choose a position"
          onKeyDown={(e) => {
            if (e.key === "Escape") { setSelPlayer(null); setSelSlot(null); return; }
            if (e.key === "Tab") {
              // aria-modal claims modality — actually trap Tab within the sheet's buttons.
              // The container itself holds focus right after opening (tabIndex=-1), so it counts
              // as "first" for Shift+Tab — otherwise focus would walk out the back of the dialog.
              const f = sheetRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
              if (!f || f.length === 0) return;
              const first = f[0], last = f[f.length - 1];
              if (e.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.current)) { e.preventDefault(); last.focus(); }
              else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
          }}
          className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-700 bg-zinc-900/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] outline-none backdrop-blur lg:hidden">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-orange-400" role="status" aria-live="polite">
              {selPlayer ? `Place ${displayName(selPlayer.name)} — choose a position` : `Move ${displayName(roster[selSlot!]!.name)}`}
            </span>
            <button onClick={() => { setSelPlayer(null); setSelSlot(null); }} aria-label="Cancel" className="px-2 text-zinc-400 hover:text-zinc-200">✕</button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {SLOTS.map((s) => {
              const occupied = !!roster[s];
              const target = slotTarget(s);
              const tag = selPlayer ? (occupied ? "Filled" : target ? "" : "N/A") : target ? "swap" : occupied && s === selSlot ? "here" : "";
              return (
                <button key={s} disabled={!target} onClick={() => clickSlot(s)}
                  className={`flex flex-col items-center justify-center rounded-lg py-2.5 text-sm font-bold ${
                    target ? "bg-orange-500 text-black" : "bg-zinc-800 text-zinc-600"}`}>
                  <span>{s}</span>{tag && <span className="text-[8px] font-semibold uppercase">{tag}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Factor Hunt prediction — focus-trapped dialog between "five locked" and the reveal.
          Lock applies the ×1.05 board bonus if right; Escape or Skip reveals with no bonus. */}
      {fhStep && (
        <div ref={fhRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Factor Hunt prediction"
          onKeyDown={(e) => {
            if (e.key === "Escape") { lockFh(null); return; }
            if (e.key === "Tab") {
              const f = fhRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
              if (!f || f.length === 0) return;
              const first = f[0], last = f[f.length - 1];
              // the container holds initial focus — treat it as "first" so Shift+Tab can't escape
              if (e.shiftKey && (document.activeElement === first || document.activeElement === fhRef.current)) { e.preventDefault(); last.focus(); }
              else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
          }}
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <div className="text-center text-xs font-black uppercase tracking-widest text-violet-400">🔮 Factor Hunt</div>
            <p className="mt-2 text-center text-base font-semibold text-zinc-100">
              {fhStep.ask === "worst"
                ? "Before the reveal — which factor is hurting this five the most?"
                : "Clean build, no weaknesses — which factor is helping the MOST?"}
            </p>
            <div className="mt-4 space-y-2" role="radiogroup" aria-label="Factor choices">
              {fhStep.choices.map((c) => (
                <button key={c} role="radio" aria-checked={fhPick === c} onClick={() => setFhPick(c)}
                  className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition ${
                    fhPick === c ? "border-violet-400 bg-violet-500/15 text-violet-200" : "border-zinc-700 bg-zinc-950/60 text-zinc-300 hover:border-zinc-500"}`}>
                  {c}
                </button>
              ))}
            </div>
            <button onClick={() => fhPick && lockFh(fhPick)} disabled={!fhPick}
              className="mt-4 w-full rounded-xl bg-violet-500 py-3 text-base font-black text-black hover:bg-violet-400 disabled:opacity-40">
              🔒 Lock prediction — ×1.05 if right
            </button>
            <button onClick={() => lockFh(null)} className="mt-2 w-full py-1 text-xs text-zinc-500 hover:text-zinc-300">
              Skip — just show the result
            </button>
          </div>
        </div>
      )}

      {/* Pick'Em pre-draft vote — focus-trapped dialog (same a11y mechanics as the sheet above).
          One tap votes; ✕ or Escape skips AND remembers the skip preference. Never blocks: the
          draft continues the moment either happens. */}
      {showPickem && current && (
        <div ref={pickemRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Pick'Em crowd vote"
          onKeyDown={(e) => {
            if (e.key === "Escape") { skipPickem(); return; }
            if (e.key === "Tab") {
              const f = pickemRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
              if (!f || f.length === 0) return;
              const first = f[0], last = f[f.length - 1];
              // the container holds initial focus — treat it as "first" so Shift+Tab can't escape
              if (e.shiftKey && (document.activeElement === first || document.activeElement === pickemRef.current)) { e.preventDefault(); last.focus(); }
              else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
          }}
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-center shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-orange-500">🗳️ Pick&apos;Em</span>
              <button onClick={skipPickem} aria-label="Skip Pick'Em — won't ask again" title="Skip — won't ask again"
                className="px-2 text-zinc-400 hover:text-zinc-200">✕</button>
            </div>
            {mode === "hoopiq" ? (
              <div className="mt-3 text-lg font-black">🧠 Mystery roster</div>
            ) : (
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="rounded-md px-2 py-1 text-sm font-black" style={{ background: teamColors(current.team).bg, color: teamColors(current.team).text }}>{current.team}</span>
                <span className="rounded-md bg-violet-500/20 px-2 py-1 text-sm font-bold text-violet-300">{eraLabel(current.decade)}</span>
              </div>
            )}
            <p className="mt-3 text-base font-semibold text-zinc-100">Will the best possible five from this roster win more than 60 games?</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button onClick={() => votePickem("y")} className="rounded-xl bg-green-500 py-3 text-base font-black text-black hover:bg-green-400">YES — 60+</button>
              <button onClick={() => votePickem("n")} className="rounded-xl bg-red-500 py-3 text-base font-black text-black hover:bg-red-400">NO</button>
            </div>
            <p className="mt-3 text-[11px] text-zinc-500">One tap — the crowd&apos;s call settles with your result.</p>
          </div>
        </div>
      )}
    </Shell>
  );
}

/* ---------- subcomponents ---------- */

function Shell({ children, roundNum, mode, onRestart, showRestart }: {
  children: React.ReactNode; roundNum: number; mode: Mode; onRestart: () => void; showRestart?: boolean;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-6">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-semibold capitalize text-zinc-300">{mode === "factorhunt" ? "Factor Hunt" : mode}</span>
          <span className="text-sm text-zinc-500">Round {roundNum}/5</span>
        </div>
        {showRestart && (
          <button onClick={onRestart} className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:border-zinc-500">↻ Restart</button>
        )}
      </header>
      {children}
    </div>
  );
}

function ModeSelect({ onPick, onOpenChallenge }: { onPick: (m: Mode) => void; onOpenChallenge: (challengeId: string) => void }) {
  const modes: { id: Mode; emoji: string; title: string; desc: string }[] = [
    { id: "daily", emoji: "📅", title: "Daily", desc: "Everyone gets the same spins today. Compare your record." },
    { id: "classic", emoji: "💯", title: "Classic", desc: "Full stats visible — draft on what you can see." },
    { id: "hoopiq", emoji: "🧠", title: "HoopIQ", desc: "Stats hidden — draft by memory, test your ball knowledge." },
    { id: "factorhunt", emoji: "🔮", title: "Factor Hunt", desc: "Daily shared spins — predict WHY before the reveal for a ×1.05 bonus." },
    { id: "challenge", emoji: "⚔️", title: "Challenge a Friend", desc: "Build a five, send a link. They draft the same teams — beat your record." },
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-center">
      <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Pick your mode</h1>
      <p className="mt-2 text-lg text-zinc-400">Build an all-time NBA starting five. Can you go undefeated?</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modes.map((m) => (
          <button key={m.id} onClick={() => onPick(m.id)}
            className="group rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-left transition hover:border-orange-500 hover:bg-zinc-800/60">
            <div className="text-3xl">{m.emoji}</div>
            <div className="mt-2 font-bold">{m.title}</div>
            <div className="mt-1 text-sm text-zinc-400">{m.desc}</div>
            <div className="mt-3 text-sm font-bold text-orange-500 group-hover:underline">Play →</div>
          </button>
        ))}
      </div>
      <ResultsHistory onOpenChallenge={onOpenChallenge} />
      <p className="mt-8 text-xs text-zinc-600">Smarter engine: every team is scored by a model fit to 1,170 real NBA seasons — and it tells you <em>why</em>.</p>
    </div>
  );
}

function Reel({ kind, value, sub, color, locked, masked, spinning }: {
  kind: string; value: string; sub: string; color: "orange" | "violet"; locked?: boolean; masked?: boolean; spinning?: boolean;
}) {
  const ring = locked ? "border-amber-500" : color === "orange" ? "border-orange-500" : "border-violet-500";
  const tag = locked ? "text-amber-400" : color === "orange" ? "text-orange-500" : "text-violet-400";
  return (
    <div className={`relative w-28 rounded-xl border-2 ${ring} bg-zinc-900 px-3 py-2 text-center shadow-md`}>
      <div className={`text-[10px] font-bold uppercase tracking-widest ${tag}`}>{locked ? "🔒 LOCKED" : kind}</div>
      <div className="text-2xl font-black leading-tight">{masked ? "???" : value}</div>
      <div className="truncate text-[10px] text-zinc-500">{masked ? "hidden" : sub}</div>
      {/* announce the settled reel once (stay quiet while cycling and when the value is masked) */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">{spinning || masked ? "" : `${kind}: ${value}`}</span>
    </div>
  );
}

function SkipBtn({ label, used, onClick, disabled }: { label: string; used: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={used || disabled}
      className={`rounded-full border px-3 py-1 font-semibold transition ${
        used ? "border-zinc-800 text-zinc-700 line-through" : "border-zinc-700 text-zinc-300 hover:border-orange-500 hover:text-orange-400"}`}>
      {label}{used ? " · used" : ""}
    </button>
  );
}

function Court({ roster, selSlot, isTarget, onSlot, maskColors }: {
  roster: Roster; selSlot: Slot | null; isTarget: (s: Slot) => boolean; onSlot: (s: Slot) => void; maskColors?: boolean;
}) {
  return (
    <div className="relative mx-auto aspect-[4/3.4] w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-b from-[#14223b] to-[#0c1626] lg:sticky lg:top-4">
      <svg viewBox="0 0 100 85" className="absolute inset-0 h-full w-full text-zinc-600/40" fill="none" stroke="currentColor" strokeWidth="0.6">
        <rect x="2" y="2" width="96" height="81" rx="2" />
        <rect x="38" y="2" width="24" height="30" />
        <circle cx="50" cy="32" r="9" />
        <path d="M10 2 A 40 40 0 0 0 90 2" />
        <line x1="2" y1="2" x2="98" y2="2" />
        <circle cx="50" cy="2" r="6" />
      </svg>
      {SLOTS.map((s) => {
        const p = roster[s];
        const target = isTarget(s);
        const picked = selSlot === s;
        const c = p ? (maskColors ? { bg: "#3f3f46", text: "#e4e4e7" } : teamColors(p.team)) : null;
        return (
          <button key={s} onClick={() => onSlot(s)} style={{ left: `${COURT[s].left}%`, top: `${COURT[s].top}%` }}
            aria-label={p ? `${p.name} at ${s}${target ? ", swap target" : ""}` : `${s} slot${target ? ", eligible — tap to place" : " (empty)"}`}
            className={`absolute -translate-x-1/2 -translate-y-1/2 transition ${target ? "animate-pulse" : ""}`}>
            {p && c ? (
              <span className={`flex h-14 w-14 flex-col items-center justify-center rounded-xl text-xs font-black leading-none shadow-lg ring-2 ${
                  picked ? "ring-orange-400" : target ? "ring-orange-400" : "ring-white/20"}`}
                style={{ background: c.bg, color: c.text }}>
                <span>{initials(p.name)}</span>
                <span className="mt-0.5 text-[8px] opacity-80">{s}</span>
              </span>
            ) : (
              <span className={`flex h-14 w-14 items-center justify-center rounded-xl border-2 border-dashed text-sm font-bold ${
                  target ? "border-orange-400 bg-orange-400/15 text-orange-300 ring-2 ring-orange-400" : "border-zinc-600/60 text-zinc-500"}`}>
                {s}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

type SortKey = "fit" | "ppg" | "rpg" | "apg" | "az";
function Browser({ spin, mode, selId, hintsLeft, onReveal, canPlace, onSelect }: {
  spin: Spin; mode: Mode; selId: string | null; hintsLeft: number; onReveal: () => void;
  canPlace: (c: DraftCandidate) => boolean; onSelect: (c: DraftCandidate) => void;
}) {
  const hideStats = mode === "hoopiq"; // HoopIQ hides stats — draft on memory
  const canHint = mode === "classic";  // Classic only: Daily is a competition (fairness), HoopIQ is a memory test
  const [revealed, setRevealed] = useState(false); // spent a hint to reveal fit for THIS pick? resets on remount (each spin/round)
  const showFit = revealed && canHint;
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<"All" | "G" | "F" | "C">("All");
  const [sort, setSort] = useState<SortKey>(showFit ? "fit" : hideStats ? "az" : "ppg");
  // if Hints is switched off mid-spin while sorted by fit, fall back without resetting user state
  const effSort: SortKey = sort === "fit" && !showFit ? (hideStats ? "az" : "ppg") : sort;

  const list = useMemo(() => {
    const inGroup = (c: DraftCandidate) =>
      group === "All" ? true :
      group === "G" ? c.eligible.some((p) => p === "PG" || p === "SG") :
      group === "F" ? c.eligible.some((p) => p === "SF" || p === "PF") :
      c.eligible.includes("C");
    const out = spin.candidates.filter((c) => inGroup(c) && c.name.toLowerCase().includes(q.toLowerCase().trim()));
    const key: Record<SortKey, (c: DraftCandidate) => number> = {
      fit: (c) => -(c.fit?.delta ?? -99), ppg: (c) => -(c.pts ?? 0), rpg: (c) => -(c.trb ?? 0), apg: (c) => -(c.ast ?? 0), az: () => 0,
    };
    out.sort((a, b) => (effSort === "az" ? a.name.localeCompare(b.name) : key[effSort](a) - key[effSort](b)));
    return out;
  }, [spin, q, group, effSort]);

  const c0 = teamColors(spin.team);
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 p-2.5">
        {hideStats ? (
          <span title="Team & era are hidden in HoopIQ — recognize the players" className="rounded-md bg-zinc-800 px-2 py-1 text-xs font-bold text-zinc-300">🧠 Mystery roster</span>
        ) : (
          <>
            <span className="rounded-md px-2 py-1 text-xs font-black" style={{ background: c0.bg, color: c0.text }}>{spin.team}</span>
            <span className="rounded-md bg-violet-500/20 px-2 py-1 text-xs font-bold text-violet-300">{eraLabel(spin.decade)}</span>
          </>
        )}
        <div className="ml-auto flex gap-1">
          {(["All", "G", "F", "C"] as const).map((g) => (
            <button key={g} onClick={() => setGroup(g)}
              className={`rounded-md px-2 py-1 text-xs font-semibold ${group === g ? "bg-orange-500 text-black" : "text-zinc-400 hover:text-zinc-200"}`}>{g}</button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search players"
          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm outline-none focus:border-orange-500 sm:w-36" />
        {canHint && (revealed ? (
          <span title="Fit grades revealed for this pick (cost 1 hint)" className="rounded-md bg-emerald-500/20 px-2 py-1.5 text-xs font-semibold text-emerald-300">
            💡 Hints on
          </span>
        ) : hintsLeft > 0 ? (
          <button onClick={() => { onReveal(); setRevealed(true); }} title={`Spend 1 hint to reveal the engine's fit grades for this pick — ${hintsLeft} left this game`}
            className="rounded-md border border-zinc-700 px-2 py-1.5 text-xs font-semibold text-zinc-400 transition hover:border-emerald-600/60 hover:text-emerald-300">
            💡 Hints · {hintsLeft} left
          </button>
        ) : (
          <span title="You've used all your hints this game" className="rounded-md border border-zinc-800 px-2 py-1.5 text-xs font-semibold text-zinc-500">
            💡 Hints used up
          </span>
        ))}
        {!hideStats && (
          <select value={effSort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort players"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none">
            {showFit && <option value="fit">Best fit</option>}
            <option value="ppg">PPG</option><option value="rpg">RPG</option><option value="apg">APG</option><option value="az">A–Z</option>
          </select>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-zinc-500">
        <span>{list.length} player{list.length === 1 ? "" : "s"} available{hideStats ? " · stats hidden" : ""}</span>
        {showFit && <span className="text-zinc-500">fit = net swing for <span className="text-zinc-400">your</span> roster</span>}
      </div>
      <div className="max-h-[420px] overflow-y-auto px-2 pb-2">
        {list.map((c) => {
          const sel = selId === c.id;
          const fits = canPlace(c);
          const showRowFit = showFit && fits && c.fit;
          return (
            <button key={c.id} onClick={() => onSelect(c)} aria-pressed={sel}
              aria-label={`Select ${c.name}, plays ${c.eligible.join("/")}${fits ? "" : ", no open slot"}${showRowFit ? `, fit ${c.fit!.delta > 0 ? "+" : ""}${c.fit!.delta}${c.fit!.adds.length ? ", adds " + c.fit!.adds.join(" and ") : ""}` : ""}`}
              className={`mb-1.5 flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                sel ? "border-orange-500 bg-orange-500/10" : showRowFit && c.fit!.best ? "border-emerald-600/50 bg-emerald-500/[0.06] hover:border-emerald-500" : fits ? "border-zinc-800 bg-zinc-950/60 hover:border-zinc-600" : "border-zinc-900 bg-zinc-950/40 opacity-55"}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{c.name}</div>
                <div className="text-[11px] text-zinc-500">
                  {c.eligible.join(" · ")}{!fits && <span className="ml-1 text-zinc-500">· no open slot</span>}
                </div>
                {showRowFit && c.fit!.adds.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.fit!.adds.map((a) => (
                      <span key={a} className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400/90">+ {a}</span>
                    ))}
                  </div>
                )}
              </div>
              {!hideStats && (
                <div className="flex shrink-0 gap-2 text-center text-[11px] text-zinc-400">
                  <Mini v={c.pts} k="PPG" /><Mini v={c.trb} k="RPG" /><Mini v={c.ast} k="APG" />
                  {/* SPG/BPG hidden on mobile to make room for the fit column; defense shows via fit tags */}
                  <Mini v={c.stl} k="SPG" className="hidden sm:block" /><Mini v={c.blk} k="BPG" className="hidden sm:block" />
                </div>
              )}
              {showRowFit && (
                <div className="w-10 shrink-0 text-right">
                  <div className={`text-sm font-bold tabular-nums ${fitColor(c.fit!)}`}>{c.fit!.delta > 0 ? "+" : ""}{c.fit!.delta}</div>
                  <div className={`text-[8px] uppercase tracking-wide ${c.fit!.best ? "text-emerald-300" : "text-zinc-400"}`}>{c.fit!.best ? "★ fit" : "fit"}</div>
                </div>
              )}
            </button>
          );
        })}
        {list.length === 0 && <div className="py-8 text-center text-xs text-zinc-500">No players match.</div>}
      </div>
    </div>
  );
}

// color the fit swing: green shades by tier when it helps, muted when it doesn't move the needle
function fitColor(f: CandidateFit): string {
  if (f.delta <= 0) return "text-zinc-500";
  return f.tier === "elite" ? "text-emerald-300" : f.tier === "strong" ? "text-emerald-400" : f.tier === "solid" ? "text-emerald-500/80" : "text-zinc-400";
}

function Mini({ v, k, className }: { v: number | null | undefined; k: string; className?: string }) {
  return (
    <div className={`w-8 ${className ?? ""}`}>
      <div className="font-semibold text-zinc-300 tabular-nums">{v == null ? "–" : v.toFixed(1)}</div>
      <div className="text-[8px] uppercase tracking-wide text-zinc-500">{k}</div>
    </div>
  );
}
