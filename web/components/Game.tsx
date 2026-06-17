"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { buildFocusTrapHandler } from "@/components/game/useFocusTrap";
import { type Mode, MODE_LABEL } from "@/components/game/types";
import { Shell } from "@/components/game/Shell";
import { ModeSelect } from "@/components/game/ModeSelect";
import { Reel } from "@/components/game/Reel";
import { UsageBar, SkipBtn } from "@/components/game/controls";
import { Court, MiniRoster } from "@/components/game/court";
import { Browser } from "@/components/game/browser";
import { usePickem } from "@/components/game/usePickem";
import { PickemOverlay } from "@/components/game/PickemOverlay";
import { useFactorHunt } from "@/components/game/useFactorHunt";
import { FhDialog } from "@/components/game/FhDialog";
import { useBlueprint } from "@/components/game/useBlueprint";
import { BlueprintDialog } from "@/components/game/BlueprintDialog";
import { useSurgeon, type SgResult } from "@/components/game/useSurgeon";
import { SurgeonDialog } from "@/components/game/SurgeonDialog";
import type { DraftCandidate, DraftStep, LeaderboardView, LineupResult, Player, Slot } from "@/lib/types";
import { SLOTS, FRANCHISES, DECADES, teamName, displayName, eraLabel } from "@/lib/teams";
import { track } from "@vercel/analytics";
import { ev } from "@/lib/ev";
import { getUid } from "@/lib/streak";
import ResultCard from "@/components/ResultCard";
import Leaderboard from "@/components/Leaderboard";
import SignInSaveNudge from "@/components/SignInSaveNudge";
import ChallengeResult from "@/components/ChallengeResult";
import ChallengeOwner from "@/components/ChallengeOwner";
import { newChallengeId, challengeSeed } from "@/lib/challenge";
import { encodeLineup, decodeShare } from "@/lib/share";
import { saveResult, writeLastResult, readLastResult } from "@/lib/resultHistory";
import { useSessionContext } from "@/components/SessionProvider";
import { pushResult } from "@/lib/account";
import { pickemSeedOk, getPickemSkip, getLocalVote } from "@/lib/pickem";
import { buildFhChoices } from "@/lib/factorHunt";
import FhLeaderboard from "@/components/FhLeaderboard";
import { BLUEPRINTS, bpCode, bpFromCode, gradeBlueprint, type BlueprintKey } from "@/lib/blueprint";
import BpLeaderboard from "@/components/BpLeaderboard";
import SurgeonResult from "@/components/SurgeonResult";
import SgLeaderboard from "@/components/SgLeaderboard";
import { applySwapToTrace } from "@/lib/trace";
import { dayUTC } from "@/lib/day";
import { ProjectionMeter } from "@/components/game/ProjectionMeter";
import { projectionAllowed, type RosterProjection } from "@/lib/projection";
type Roster = Record<Slot, DraftCandidate | null>;
const EMPTY: Roster = { PG: null, SG: null, SF: null, PF: null, C: null };
interface Spin { team: string; decade: string; candidates: DraftCandidate[] }
type SpinOpts = { lockedTeam?: string; lockedDecade?: string; excludeTeam?: string; excludeDecade?: string; salt?: number };
// The full current result kept in localStorage for a same-session refresh (carries the draft trace
// plus, for Factor Hunt, the locked prediction so the verdict chip survives a refresh — and, for
// Blueprint, the committed objective so the execution strip and board submit survive one too).
type LastResult = { mode: Mode; seed: string; result?: { result: LineupResult; players: Player[]; trace: DraftStep[]; usedHints: boolean }; fh?: string | null; bp?: BlueprintKey | null; sg?: SgResult };

function todaySeed() {
  return dayUTC();
}
const rand = () => Math.floor(Math.random() * 1e9);

// First-run levers tip (R6): hydration-safe "seen" read. Server snapshot is "seen" (true) so the
// server renders nothing; the client reads the real flag and useSyncExternalStore reconciles without
// a hydration mismatch (same pattern ResultCard uses for the Web Share capability check).
const subscribeNoop = () => () => {};
const getTipSeen = () => { try { return !!localStorage.getItem("szn_levers_tip_seen"); } catch { return true; } };
const getTipSeenServer = () => true;

// Hints are a limited resource: this many assisted picks per game (Classic only), so the engine's
// fit grade can't be used to mindlessly auto-pick all five. Tune here (1 = strict, 3 = friendly).
const HINT_BUDGET = 2;

export default function Game() {
  const { user } = useSessionContext();
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
  const [lbView, setLbView] = useState<LeaderboardView | null>(null); // daily standing for the result-card pill
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [challengeRole, setChallengeRole] = useState<"create" | "respond" | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null); // viewing a challenge I created (restored from URL or opened from "Your results")
  const [restoring, setRestoring] = useState(false);           // briefly true while a refresh rebuilds a finished result
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projection, setProjection] = useState<RosterProjection | null>(null); // live floor↔ceiling win band (Classic/Prime/Blueprint)
  // R6: first-run scoring primer — dismissible, localStorage-gated, never blocks play (no modal).
  // tipSeen is read hydration-safely; tipDismissed covers the in-session dismiss.
  const tipSeen = useSyncExternalStore(subscribeNoop, getTipSeen, getTipSeenServer);
  const [tipDismissed, setTipDismissed] = useState(false);
  const showLeversTip = !tipSeen && !tipDismissed;
  // Hints are OFF by default for everyone, every session, every pick — never persisted. In Classic you
  // spend a hint to REVEAL the engine's fit grades for the current pick (HINT_BUDGET per game). Revealing
  // charges immediately, so there's no "peek, then toggle off, then pick" to dodge the cost.
  const [hintsUsed, setHintsUsed] = useState(0);   // hints spent this game (UI mirror of the ref)
  const hintsUsedRef = useRef(0);                  // synchronous count, read at simulate time
  const saltRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const traceRef = useRef<DraftStep[]>([]);            // ordered picks for leaderboard verification
  const roundRespinsRef = useRef<("team" | "era")[]>([]); // re-spins used in the current round
  const [convertedId, setConvertedId] = useState<string | null>(null); // challenge minted from a finished game
  const abortSimRef = useRef<AbortController | null>(null);             // cancels an in-flight simulate on restart
  const sheetRef = useRef<HTMLDivElement>(null);                        // mobile "choose position" dialog
  // Pick'Em: one-tap crowd vote locked after the first reels settle, settled on the result card.
  const { pickemVote, pickemDismissed, pickemCrowd, pickemSubject, pickemRef, votePickem, skipPickem, reset: resetPickem } = usePickem(seed, current, mode, result);
  // Factor Hunt: prediction step between "five locked" and the reveal (hook called after simulate, see below).
  // Blueprint: the objective committed in the pre-spin modal (locks at confirm — gameplay psychology;
  // the server grades whatever the submit declares, see /api/blueprint/submit).
  const { blueprint, setBlueprint, bpPick, setBpPick, bpRef, commitBlueprint, reset: resetBp } = useBlueprint();
  // Surgeon: phase-2 replacement-pool step between "five locked" and the delta reveal.
  const { sgPool, sgInId, setSgInId, sgOutId, setSgOutId, sgResult, setSgResult, sgName, setSgName, sgBusy, sgRef, beginSurgeon, confirmSurgeon, dismissPool: dismissSgPool, reset: resetSg } = useSurgeon(seed, mode, traceRef, setLoading, setError);

  // Spend a hint to reveal fit grades for the current pick. Charges on reveal (not on placement), so
  // there is no way to peek and then dodge the cost. No-op once the per-game budget is spent.
  // Prime Draft is "identical to Classic" per spec, hints included; Blueprint follows Classic's hint
  // rules too (its board rows carry the hint stamp for transparency).
  const revealHint = useCallback(() => {
    if ((mode !== "classic" && mode !== "prime" && mode !== "blueprint") || hintsUsedRef.current >= HINT_BUDGET) return;
    hintsUsedRef.current += 1; setHintsUsed(hintsUsedRef.current);
  }, [mode]);

  const drafted = useMemo(() => SLOTS.map((s) => roster[s]).filter(Boolean) as DraftCandidate[], [roster]);
  const filled = drafted.length;
  const allFilled = filled === 5;
  const roundNum = Math.min(filled + 1, 5);
  const openSlots = useMemo(() => SLOTS.filter((s) => !roster[s]), [roster]);
  const rosterKey = useMemo(() => SLOTS.map((s) => roster[s]?.id ?? "").join("|"), [roster]);
  const projAllowed = projectionAllowed(seed);

  useEffect(() => () => { if (tickRef.current) clearTimeout(tickRef.current); }, []);

  // Live projection (Classic / Prime / Blueprint only): after each placement, fetch the floor↔ceiling
  // win band for the roster so far. Read-only, gated server-side too, and never blocks the draft.
  useEffect(() => {
    if (!projAllowed || filled < 1 || filled > 4) return;
    const lineup = rosterKey.split("|").map((id) => id || null);
    const ctrl = new AbortController();
    fetch("/api/project", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seed, lineup }), signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.floor) setProjection(d as RosterProjection); })
      .catch(() => { /* offline or aborted — keep the last projection on screen */ });
    return () => ctrl.abort();
  }, [seed, filled, projAllowed, rosterKey]);

  const dismissLeversTip = useCallback(() => {
    try { localStorage.setItem("szn_levers_tip_seen", "1"); } catch { /* no storage */ }
    setTipDismissed(true);
  }, []);

  // move keyboard focus into the mobile position sheet when it opens, and restore it to the
  // triggering element when it closes (paired with the Tab trap in the sheet's onKeyDown below)
  useEffect(() => {
    if (!(selPlayer || selSlot)) return;
    const prev = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    return () => prev?.focus?.();
  }, [selPlayer, selSlot]);

  // Hold-your-place: while a finished result is on screen, mirror it into the URL (?r=&m=) so a refresh
  // restores it. Challenge mode owns the URL via ?own=<id> (set by ChallengeOwner), so it's skipped here.
  // Surgeon hold-your-place: mirror the /sg/ card so a same-session refresh restores the delta.
  useEffect(() => {
    if (mode !== "surgeon" || !sgResult) return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("sg", sgResult.card); u.searchParams.set("m", "surgeon");
      u.searchParams.delete("r"); u.searchParams.delete("d"); u.searchParams.delete("c"); u.searchParams.delete("own");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch { /* no history API */ }
  }, [mode, sgResult]);

  useEffect(() => {
    if (!result || !mode || mode === "challenge") return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("r", encodeLineup(result.players.map((p) => p.id), result.usedHints, mode === "prime", mode === "blueprint" && blueprint ? bpCode(blueprint) : null));
      u.searchParams.set("m", mode);
      // daily/FH/blueprint boards are per-date — carry the date so a cold restore shows the right day's board, not today's
      if (mode === "daily") u.searchParams.set("d", seed.replace("daily-", ""));
      else if (mode === "factorhunt") u.searchParams.set("d", seed.replace("fh-", ""));
      else if (mode === "blueprint") u.searchParams.set("d", seed.replace("bp-", ""));
      else u.searchParams.delete("d");
      u.searchParams.delete("c"); u.searchParams.delete("own");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch { /* no history API */ }
  }, [result, mode, seed, blueprint]);

  const runSpin = useCallback(async (opts: SpinOpts, locked: "team" | "era" | null = null) => {
    if (spinning) return;
    setError(null); setSpinning(true); setCurrent(null); setSelPlayer(null); setSelSlot(null); setLockedReel(locked);
    if (tickRef.current) clearTimeout(tickRef.current);
    const reduce = typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
    // Cosmetic reel churn: a fast blur while the (deterministic) spin resolves, then a slot-machine
    // deceleration over the fixed floor so the value visibly clicks into place. Self-rescheduling
    // setTimeout (not setInterval) so the ramp can slow per-tick. The result and the 1100ms floor
    // below are untouched — 82-0 parity holds; the tick is purely visual. Skipped under reduced-motion.
    const churn = () => setReel({
      team: locked === "team" ? opts.lockedTeam! : FRANCHISES[Math.floor(Math.random() * FRANCHISES.length)],
      // Prime Draft: the era reel never cycles — it's permanently locked to PRIME
      era: mode === "prime" ? "PRIME" : locked === "era" ? eraLabel(opts.lockedDecade!) : eraLabel(DECADES[Math.floor(Math.random() * DECADES.length)]),
    });
    let decel = false;
    let step = 0;
    const DECEL = [70, 85, 105, 130, 165, 210, 270, 340]; // ramps up; the snap below cuts it at the floor
    const schedule = () => {
      const gap = decel ? DECEL[step] : 60;
      if (gap === undefined) return; // deceleration ramp exhausted — hold the last value until the snap
      tickRef.current = setTimeout(() => { churn(); if (decel) step += 1; schedule(); }, gap);
    };
    if (!reduce) schedule();
    try {
      const r = await fetch("/api/spin", {
        method: "POST", headers: { "content-type": "application/json" },
        // fit grades are a Classic-style hint assist (Classic + Prime + Blueprint); never requested
        // in Daily/HoopIQ/Challenge/Factor Hunt so the network response can't be read to draft optimally
        body: JSON.stringify({ seed, round: filled, exclude: drafted.map((p) => p.id), fit: mode === "classic" || mode === "prime" || mode === "blueprint", ...opts }),
      });
      if (!r.ok) throw new Error("spin failed");
      const res: Spin = await r.json();
      // result known — restart the churn as a deceleration ramp from the first (fast) step
      if (!reduce) { if (tickRef.current) clearTimeout(tickRef.current); decel = true; step = 0; schedule(); }
      await new Promise((rs) => setTimeout(rs, 1100));
      if (tickRef.current) { clearTimeout(tickRef.current); tickRef.current = null; }
      setReel({ team: res.team, era: eraLabel(res.decade) });
      setCurrent(res);
      // a single haptic "click" at the landing — Android only; iOS/desktop silently no-op
      if (!reduce) { try { navigator.vibrate?.(35); } catch { /* no haptics */ } }
    } catch {
      setLockedReel(null); setReel({ team: "ATL", era: mode === "prime" ? "PRIME" : "60's" });
      // roll back the re-spin we optimistically charged before this call so a network error doesn't
      // silently burn the skip (and don't leave a phantom re-spin in the verification trace)
      if (locked === "era") setSkips((s) => ({ ...s, team: false }));
      else if (locked === "team") setSkips((s) => ({ ...s, era: false }));
      // also roll back the pre-incremented salt — the next successful re-spin must reuse this salt
      // value, or verifyTrace (which counts only the re-spins in the trace) would reject the submit.
      if (locked !== null) { roundRespinsRef.current = roundRespinsRef.current.slice(0, -1); saltRef.current--; }
      setError("Network hiccup — tap SPIN to try again.");
    } finally {
      if (tickRef.current) clearTimeout(tickRef.current);
      setSpinning(false);
    }
  }, [spinning, seed, filled, drafted, mode]);

  const spin = useCallback(() => runSpin({}), [runSpin]);

  // Blueprint: cancelBlueprint also resets mode (backs to picker) — uses setMode from Game scope.
  const cancelBlueprint = useCallback(() => { setMode(null); resetBp(); }, [resetBp]);
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
      writeLastResult({ mode, seed, result: full, fh: fhPred, bp: blueprint });
      if (mode) {
        const saved = saveResult({ encoded: encodeLineup(full.players.map((p) => p.id), full.usedHints, mode === "prime", mode === "blueprint" && blueprint ? bpCode(blueprint) : null), mode, wins: data.result.wins, losses: data.result.losses, grade: data.result.grade });
        if (user) void pushResult(saved); // signed in: mirror this game to the account history (cross-device)
      }
      track("lineup_complete", { wins: data.result.wins, grade: data.result.grade });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // superseded by a restart — ignore
      setError("Couldn't simulate the season — tap Simulate to retry.");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [mode, seed, blueprint, user]);

  // Factor Hunt: hook placed after simulate so beginFhPrediction can close over the stable callback.
  const { fhStep, fhPick, setFhPick, fhPrediction, setFhPrediction, fhRef, beginFhPrediction, lockFh, reset: resetFh } = useFactorHunt(seed, simulate, setError);

  // start() placed after all per-mode hook calls so it can close over their stable reset functions
  // without triggering react-hooks/immutability (resetFh, resetPickem, resetBp, resetSg all have []
  // deps — but must be declared before start references them).
  const start = useCallback((m: Mode, challenge?: { id: string; role: "create" | "respond"; seed?: string }) => {
    track("mode_start", { mode: m });
    ev("play", { uid: getUid(), mode: m });
    abortSimRef.current?.abort(); abortSimRef.current = null; // cancel any in-flight simulate
    setMode(m);
    let cid: string | null = null;
    let crole: "create" | "respond" | null = null;
    let s: string;
    if (m === "challenge") {
      cid = challenge?.id ?? newChallengeId();
      crole = challenge?.role ?? "create";
      s = challenge?.seed ?? challengeSeed(cid); // a converted/legacy challenge replays its own carried seed
    } else {
      // daily/factorhunt/blueprint/surgeon share one deterministic seed per UTC day; free-play modes roll fresh
      s = m === "daily" ? `daily-${todaySeed()}` : m === "factorhunt" ? `fh-${todaySeed()}` : m === "blueprint" ? `bp-${todaySeed()}` : m === "surgeon" ? `surgeon-${todaySeed()}` : `${m}-${rand()}`;
    }
    setChallengeId(cid); setChallengeRole(crole); setSeed(s);
    setRoster(EMPTY); setCurrent(null); setResult(null); setLbView(null); setError(null); setLoading(false); setProjection(null);
    setSelPlayer(null); setSelSlot(null); setSkips({ team: false, era: false });
    setReel({ team: "ATL", era: m === "prime" ? "PRIME" : "60's" }); setLockedReel(null); saltRef.current = 0;
    traceRef.current = []; roundRespinsRef.current = []; setConvertedId(null);
    hintsUsedRef.current = 0; setHintsUsed(0);
    resetPickem(); resetFh(); resetBp(); resetSg();
    setOwnerId(null);
    // a new game owns the URL — drop any restore params so a later refresh won't resurrect an old screen
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("r") || u.searchParams.has("m") || u.searchParams.has("own") || u.searchParams.has("d") || u.searchParams.has("sg")) {
        u.searchParams.delete("r"); u.searchParams.delete("m"); u.searchParams.delete("own"); u.searchParams.delete("d"); u.searchParams.delete("sg");
        window.history.replaceState(null, "", u.pathname + u.search + u.hash);
      }
    } catch { /* no history API */ }
  }, [resetPickem, resetFh, resetBp, resetSg]);

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

        // Surgeon same-session restore: the full before/after lives in lastResult (the result is a
        // two-lineup delta, not a single encoded five). Cold restore (other device) falls through
        // to the picker — the /sg/<card> permalink is the shareable artifact and the board persists.
        const sgCard = params.get("sg");
        if (sgCard && params.get("m") === "surgeon") {
          const last = readLastResult<LastResult>();
          if (last?.mode === "surgeon" && last.sg && last.sg.card === sgCard) {
            if (cancelled) return;
            setMode("surgeon"); setSeed(last.seed); setSgResult(last.sg);
          }
          return;
        }

        const enc = params.get("r");
        const m = params.get("m") as Mode | null;
        if (enc && (m === "daily" || m === "classic" || m === "hoopiq" || m === "factorhunt" || m === "prime" || m === "blueprint")) {
          setRestoring(true);
          // same-session full restore: keeps the draft trace the Daily board needs to submit
          const last = readLastResult<LastResult>();
          if (last && last.mode === m && last.result && encodeLineup(last.result.players.map((p) => p.id), last.result.usedHints, m === "prime", m === "blueprint" && last.bp ? bpCode(last.bp) : null) === enc) {
            if (cancelled) return;
            setMode(m); setSeed(last.seed); setResult(last.result); setFhPrediction(last.fh ?? null); setBlueprint(last.bp ?? null); setRestoring(false); return;
          }
          // cold restore (other device / cleared storage): rebuild from the five's ids. No trace, so the
          // Daily leaderboard renders read-only (still shows your standing, just no re-submit).
          const { ids, hinted, bp } = decodeShare(enc);
          if (ids.length !== 5 || new Set(ids).size !== 5) { if (!cancelled) setRestoring(false); return; }
          try {
            const res = await fetch("/api/evaluate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
            if (!res.ok) throw new Error("evaluate failed");
            const data = await res.json();
            if (cancelled) return;
            // daily/FH/blueprint boards are per-date — use the date carried in the URL so a cold restore
            // shows the result's own day (read-only), not today's empty board. Fall back to today if absent/bad.
            const d = params.get("d");
            const dailyDate = d && /^\d{4}-\d{1,2}-\d{1,2}$/.test(d) ? d : todaySeed();
            setMode(m); setSeed(m === "daily" ? `daily-${dailyDate}` : m === "factorhunt" ? `fh-${dailyDate}` : m === "blueprint" ? `bp-${dailyDate}` : `${m}-restored`);
            if (m === "blueprint") setBlueprint(bpFromCode(bp)); // the committed objective rides the encoded lineup
            setResult({ result: data.result, players: data.players, trace: [], usedHints: hinted });
          } catch { /* leave on the mode picker */ }
          finally { if (!cancelled) setRestoring(false); }
        }
      } catch { /* no query / no history API */ }
    })();
    return () => { cancelled = true; };
  }, [start, setBlueprint, setFhPrediction, setSgResult]);

  // Surgeon phase 2: post the trace to /api/surgeon/pool — the server replays it, diagnoses the
  // worst factor, and deals 3 targeted candidates with WHY each (never an after-value). Any failure
  // surfaces as an error with a retry; no offline fallback (the pool is a server computation).
  // Mode fork at "five locked": Factor Hunt detours through the prediction step; Surgeon detours
  // through the diagnosis/swap step; everyone else simulates immediately (pre-FH behavior).
  const finishDraft = useCallback((r: Roster) => {
    if (mode === "factorhunt") beginFhPrediction(r);
    else if (mode === "surgeon") beginSurgeon(r);
    else simulate(r);
  }, [mode, beginFhPrediction, beginSurgeon, simulate]);

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
      if (canSwap(selSlot, slot)) {
        // re-stamp the moved players' trace entries with their FINAL slots, or the server replay
        // sees a later pick into the vacated slot as "slot reused" and rejects the submit
        applySwapToTrace(traceRef.current, roster[selSlot]?.id, roster[slot]?.id, selSlot, slot);
        setRoster((r) => ({ ...r, [slot]: r[selSlot], [selSlot]: r[slot] }));
      }
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
  // Suppressed in HoopIQ: the roster is hidden there, so "will the best five win 60+?" is a blind
  // guess with nothing to reason about.
  const showPickem = !!current && filled === 0 && mode !== "challenge" && mode !== "hoopiq" && mode !== null &&
    !pickemDismissed && !pickemVote && pickemSeedOk(seed) && !getPickemSkip() && !getLocalVote(seed);

  // Vote overlay focus management (same pattern as the mobile position sheet above).
  useEffect(() => {
    if (!showPickem) return;
    const prev = document.activeElement as HTMLElement | null;
    pickemRef.current?.focus();
    return () => prev?.focus?.();
  }, [showPickem, pickemRef]);

  // Factor Hunt prediction dialog focus management (same pattern).
  useEffect(() => {
    if (!fhStep) return;
    const prev = document.activeElement as HTMLElement | null;
    fhRef.current?.focus();
    return () => prev?.focus?.();
  }, [fhStep, fhRef]);

  // Blueprint commit dialog focus management (same pattern).
  const showBpModal = mode === "blueprint" && !blueprint && !restoring;
  useEffect(() => {
    if (!showBpModal) return;
    const prev = document.activeElement as HTMLElement | null;
    bpRef.current?.focus();
    return () => prev?.focus?.();
  }, [showBpModal, bpRef]);

  // Surgeon swap dialog focus management (same pattern).
  useEffect(() => {
    if (!sgPool) return;
    const prev = document.activeElement as HTMLElement | null;
    sgRef.current?.focus();
    return () => prev?.focus?.();
  }, [sgPool, sgRef]);

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
  // Blueprint execution view: graded from the revealed result with the same pure helper the
  // submit route verifies with, so the card strip and the board grade can never disagree.
  const bpView = mode === "blueprint" && blueprint && result ? gradeBlueprint(blueprint, result.result) : undefined;
  // Surgeon reveal: its own before/after layout + delta board, not the single-lineup ResultCard.
  if (mode === "surgeon" && sgResult) return (
    <Shell roundNum={5} mode={mode} onRestart={() => start(mode)} showRestart>
      <SurgeonResult before={sgResult.before} after={sgResult.after} beforePlayers={sgResult.beforePlayers}
        afterPlayers={sgResult.afterPlayers} outIdx={sgResult.outIdx} diagnosis={sgResult.diagnosis}
        card={sgResult.card} onReset={() => start("surgeon")} />
      <SgLeaderboard date={seed.replace("surgeon-", "")} preloaded={sgResult.view} />
    </Shell>
  );
  if (result) return (
    <Shell roundNum={roundNum} mode={mode} onRestart={() => start(mode)} showRestart>
      <ResultCard result={result.result} players={result.players} slots={SLOTS} mode={MODE_LABEL[mode]} usedHints={result.usedHints} onReset={() => start(mode)} pickem={pickemView} factorHunt={fhView} prime={mode === "prime"} blueprint={bpView}
        lbRank={mode === "daily" && lbView?.you ? { rank: lbView.you.rank, total: lbView.total } : null} />
      {mode === "daily" && <Leaderboard date={seed.replace("daily-", "")} trace={result.trace} usedHints={result.usedHints} readOnly={result.trace.length === 0} onView={setLbView} />}
      {/* Classic/HoopIQ/Prime have no board, so they'd otherwise offer a signed-out player no reason to
          make an account — give them the minimal save/keep-streak sign-in nudge. */}
      {(mode === "classic" || mode === "hoopiq" || mode === "prime") && <SignInSaveNudge />}
      {mode === "factorhunt" && <FhLeaderboard date={seed.replace("fh-", "")} trace={result.trace} prediction={fhPrediction} readOnly={result.trace.length === 0} />}
      {mode === "blueprint" && blueprint && <BpLeaderboard date={seed.replace("bp-", "")} trace={result.trace} blueprint={blueprint} usedHints={result.usedHints} readOnly={result.trace.length === 0} />}
      {mode === "challenge" && challengeId && challengeRole && (
        <ChallengeResult id={challengeId} role={challengeRole} seed={seed} usedHints={false} result={result.result} players={result.players}
          trace={result.trace} onCreateOwn={() => start("challenge")} />
      )}
      {/* FH/Prime/Blueprint/Surgeon seeds can't convert to H2H challenges (the challenge store only
          accepts daily/classic/hoopiq game seeds), so the convert CTA is hidden there. */}
      {mode !== "challenge" && mode !== "factorhunt" && mode !== "prime" && mode !== "blueprint" && mode !== "surgeon" && (convertedId ? (
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
  // Live usage budget: shown from the very first pick in every stats-visible mode so the cap's
  // EXISTENCE is disclosed before the anchor pick — not sprung at round 3, after the two most
  // consequential picks. It reads an empty "0% / budget" at the start, then fills live as players
  // are placed; USAGE DISCIPLINE adds its A+/A grade lines. HoopIQ stays bar-free (its premise is
  // drafting blind). Usage is intrinsic public player data, not a seed-relative hint, so competitive
  // seeds are unaffected (DESIGN.md §12).
  const discBar = mode === "blueprint" && blueprint === "discipline";
  const showUsageBar = discBar || !hideIQ;

  return (
    <Shell roundNum={roundNum} mode={mode} onRestart={() => start(mode)} showRestart={filled > 0 || !!current}>
      {/* reels */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Reel kind="TEAM" value={reel.team} sub={teamName(reel.team)} color="orange" locked={lockedReel === "team"} masked={reelMasked(lockedReel === "team")} spinning={spinning || !current} />
        <Reel kind="ERA" value={reel.era} sub={mode === "prime" ? "peak form" : "decade"} color="violet" prime={mode === "prime"}
          locked={mode !== "prime" && lockedReel === "era"} masked={reelMasked(lockedReel === "era")} spinning={mode !== "prime" && (spinning || !current)} />
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
      {mode === "prime" && (
        <p className="mt-2 text-center text-[11px] text-zinc-500">⚡ Fantasy simulation, not historical — every legend at his peak, any era.</p>
      )}
      {mode === "blueprint" && blueprint && (
        <p className="mt-2 text-center text-[11px] text-cyan-400/80">📐 Committed: {BLUEPRINTS.find((b) => b.key === blueprint)!.label} — the engine grades your execution.</p>
      )}
      {mode === "surgeon" && (
        <p className="mt-2 text-center text-[11px] text-rose-400/80">🩺 Draft five — then the engine diagnoses your worst factor and deals one fix.</p>
      )}
      {/* First-run scoring primer (R6): names the real levers honestly so new players don't learn the
          mechanics only by losing. Skipped where it would conflict or duplicate — HoopIQ is deliberately
          blind, Blueprint has its own objective dialog, Surgeon's diagnosis step teaches the same vocab. */}
      {showLeversTip && mode !== "hoopiq" && mode !== "blueprint" && mode !== "surgeon" && (
        <details open className="mx-auto mt-3 w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-left">
          <summary className="cursor-pointer text-xs font-bold text-zinc-300">New here? How your five is scored</summary>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
            The engine simulates 82 games and weighs several things at once: <strong className="text-zinc-300">star offense</strong> and{" "}
            <strong className="text-zinc-300">defense</strong>, floor <strong className="text-zinc-300">spacing</strong>, and{" "}
            <strong className="text-zinc-300">usage overload</strong> — one ball can&apos;t feed five high-usage scorers. Two more quietly
            decide seasons: <strong className="text-zinc-300">interior size</strong> (rim protection) and{" "}
            <strong className="text-zinc-300">perimeter defense</strong> — a five with neither bleeds real wins. Pre-1985 box stats are
            discounted, too. The bottom line is fit, not PPG.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button onClick={dismissLeversTip} className="rounded-md bg-zinc-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-700">Got it</button>
            <a href="/how-it-works" className="text-[11px] font-semibold text-orange-400 hover:underline">Full breakdown →</a>
          </div>
        </details>
      )}
      {/* USAGE DISCIPLINE drafts to a non-obvious budget — the live bar is the spec's fix.
          Everywhere else the bar pre-explains the engine's dominant penalty (see showUsageBar). */}
      {showUsageBar && <UsageBar total={drafted.reduce((a, c) => a + (c.usage ?? 0), 0)} discipline={discBar} />}
      {projAllowed && !allFilled && filled >= 1 && projection?.floor && <ProjectionMeter projection={projection} />}
      {(current || spinning) && (
        <div className="mt-2 flex justify-center gap-2 text-xs">
          <SkipBtn label="↻ Re-spin Team" used={skips.team} onClick={reSpinTeam} disabled={spinning} />
          {/* the era reel is hard-locked to PRIME in Prime Draft — no era re-spin to offer */}
          {mode !== "prime" && <SkipBtn label="↻ Re-spin Era" used={skips.era} onClick={reSpinEra} disabled={spinning} />}
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_minmax(300px,380px)]">
        {/* candidate browser (first on mobile + desktop-left) */}
        <div className="order-first">
          {/* mobile: your five at a glance, directly above the candidates (the half-court is below the fold) */}
          <MiniRoster roster={roster} maskColors={hideIQ} />
          {current ? (
            <Browser key={`${current.team}|${current.decade}|${roundNum}`} spin={current} mode={mode} selId={selPlayer?.id ?? null}
              hintsLeft={Math.max(0, HINT_BUDGET - hintsUsed)} onReveal={revealHint}
              showUsage={mode === "blueprint" && blueprint === "discipline"}
              canPlace={(c) => openSlots.some((s) => c.eligible.includes(s))}
              onSelect={(c) => { setSelSlot(null); setSelPlayer((p) => (p?.id === c.id ? null : c)); }} />
          ) : (
            <div className="animate-rise-in rounded-2xl border border-dashed border-zinc-800 p-8 text-center">
              {allFilled ? (
                <>
                  <p className="mb-3 text-sm text-zinc-400">Your starting five is set.</p>
                  <button onClick={() => finishDraft(roster)} disabled={loading}
                    className="rounded-xl bg-orange-500 px-6 py-2.5 font-bold text-black hover:bg-orange-400 disabled:opacity-50">
                    {mode === "factorhunt" ? "Lock Five → Predict" : mode === "surgeon" ? "Lock Five → Diagnose" : "Simulate Season"}
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
          <Court roster={roster} selSlot={selSlot} isTarget={slotTarget} onSlot={clickSlot} maskColors={hideIQ} idle={!selPlayer && !selSlot} />
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
          onKeyDown={(e) => buildFocusTrapHandler(sheetRef, () => { setSelPlayer(null); setSelSlot(null); })(e)}
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
                  className={`flex min-h-12 flex-col items-center justify-center rounded-lg py-3 text-sm font-bold transition active:scale-95 ${
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
        <FhDialog fhStep={fhStep} fhPick={fhPick} setFhPick={setFhPick} lockFh={lockFh} dialogRef={fhRef} />
      )}

      {/* Pick'Em pre-draft vote — focus-trapped dialog (same a11y mechanics as the sheet above).
          One tap votes; ✕ or Escape skips AND remembers the skip preference. Never blocks: the
          draft continues the moment either happens. */}
      {showPickem && current && (
        <PickemOverlay current={current} mode={mode} dialogRef={pickemRef} onVote={votePickem} onSkip={skipPickem} />
      )}

      {/* Blueprint commitment — focus-trapped dialog gating the FIRST spin (commit before you see
          the reels). Confirm locks the objective for the game; Escape backs out to the mode picker. */}
      {showBpModal && (
        <BlueprintDialog bpPick={bpPick} setBpPick={setBpPick} onCommit={commitBlueprint} onCancel={cancelBlueprint} dialogRef={bpRef} />
      )}

      {/* Surgeon phase 2 — focus-trapped "Replacement Pool" dialog (spec's anti-"rigged" labelling:
          each candidate shows WHY it was offered). Pick a candidate, then which of your five to drop
          (only slot-eligible targets are offered); confirm submits the swap (the reveal IS the submit). */}
      {sgPool && (
        <SurgeonDialog sgPool={sgPool} sgInId={sgInId} setSgInId={setSgInId} sgOutId={sgOutId} setSgOutId={setSgOutId} sgName={sgName} setSgName={setSgName} sgBusy={sgBusy} error={error} confirmSurgeon={confirmSurgeon} dismissPool={dismissSgPool} dialogRef={sgRef} />
      )}
    </Shell>
  );
}
