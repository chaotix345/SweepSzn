"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Mode } from "@/components/game/types";
import { Shell } from "@/components/game/Shell";
import { ModeSelect } from "@/components/game/ModeSelect";
import { usePickem } from "@/components/game/usePickem";
import { PickemOverlay } from "@/components/game/PickemOverlay";
import ResultSkeleton from "@/components/ResultSkeleton";
import { useFactorHunt } from "@/components/game/useFactorHunt";
import { FhDialog } from "@/components/game/FhDialog";
import { useBlueprint } from "@/components/game/useBlueprint";
import { BlueprintDialog } from "@/components/game/BlueprintDialog";
import { useSurgeon } from "@/components/game/useSurgeon";
import { SurgeonDialog } from "@/components/game/SurgeonDialog";
import { DraftView } from "@/components/game/DraftView";
import { DuelGame } from "@/components/game/DuelGame";
import { GameResultView, SurgeonResultView } from "@/components/game/GameResultView";
import { useReelSpin, initialReel } from "@/components/game/useReelSpin";
import { useRestoreFromUrl } from "@/components/game/useRestoreFromUrl";
import { useHoldYourPlace } from "@/components/game/useHoldYourPlace";
import { useDialogFocus } from "@/components/game/useDialogFocus";
import { EMPTY, HINT_BUDGET, stripRestoreParams, todaySeed, type GameResult, type Roster, type Spin } from "@/components/game/gameState";
import type { DraftCandidate, DraftStep, Player, Slot } from "@/lib/types";
import { SLOTS } from "@/lib/teams";
import { track } from "@vercel/analytics";
import { ev } from "@/lib/ev";
import { markFirstPlay } from "@/lib/firstPlay";
import { currentUtmSource, getUtmSource } from "@/lib/utm";
import { currentRefCode, getRefCode } from "@/lib/referral";
import { scrollToTop } from "@/lib/scroll";
import { getUid } from "@/lib/streak";
import ChallengeOwner from "@/components/ChallengeOwner";
import { newChallengeId, challengeSeed } from "@/lib/challenge";
import { encodeLineup } from "@/lib/share";
import { saveResult, writeLastResult } from "@/lib/resultHistory";
import { useSessionContext } from "@/components/SessionProvider";
import { pushResult } from "@/lib/account";
import { pickemSeedOk, getPickemSkip, getLocalVote } from "@/lib/pickem";
import { bpCode } from "@/lib/blueprint";
import { applySwapToTrace } from "@/lib/trace";
import { projectionAllowed, type RosterProjection } from "@/lib/projection";
import { isoDay } from "@/lib/poolDate";

const rand = () => Math.floor(Math.random() * 1e9);

export default function Game() {
  const { user } = useSessionContext();
  const [mode, setMode] = useState<Mode | null>(null);
  const [seed, setSeed] = useState("");
  const [asOf, setAsOf] = useState(""); // pool date pinned at game start (a challenge's stored date for responders)
  const [roster, setRoster] = useState<Roster>(EMPTY);
  const [current, setCurrent] = useState<Spin | null>(null);
  const [crowdNote, setCrowdNote] = useState<string | null>(null); // post-lock "how others played this slot" reveal
  const [selPlayer, setSelPlayer] = useState<DraftCandidate | null>(null);
  const [selSlot, setSelSlot] = useState<Slot | null>(null);
  const [skips, setSkips] = useState({ team: false, era: false });
  const [result, setResult] = useState<GameResult | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [challengeRole, setChallengeRole] = useState<"create" | "respond" | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null); // viewing a challenge I created (restored from URL or opened from "Your results")
  const [restoring, setRestoring] = useState(false);           // briefly true while a refresh rebuilds a finished result
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projection, setProjection] = useState<RosterProjection | null>(null); // live floor↔ceiling win band (Classic/Prime/Blueprint)
  // Hints are OFF by default for everyone, every session, every pick — never persisted. In Classic you
  // spend a hint to REVEAL the engine's fit grades for the current pick (HINT_BUDGET per game). Revealing
  // charges immediately, so there's no "peek, then toggle off, then pick" to dodge the cost.
  const [hintsUsed, setHintsUsed] = useState(0);   // hints spent this game (UI mirror of the ref)
  const hintsUsedRef = useRef(0);                  // synchronous count, read at simulate time
  const saltRef = useRef(0);
  const genRef = useRef(0);                            // game generation: bumped when a game is abandoned so its late spin/crowd fetch bails
  const traceRef = useRef<DraftStep[]>([]);            // ordered picks for leaderboard verification
  const roundRespinsRef = useRef<("team" | "era")[]>([]); // re-spins used in the current round
  const abortSimRef = useRef<AbortController | null>(null);             // cancels an in-flight simulate on restart
  // Pick'Em: one-tap crowd vote locked after the first reels settle, settled on the result card.
  const { pickemVote, pickemDismissed, pickemCrowd, pickemSubject, pickemRef, votePickem, skipPickem, reset: resetPickem } = usePickem(seed, current, mode, result);
  // Factor Hunt: prediction step between "five locked" and the reveal (hook called after simulate, see below).
  // Blueprint: the objective committed in the pre-spin modal (locks at confirm — gameplay psychology;
  // the server grades whatever the submit declares, see /api/blueprint/submit).
  const { blueprint, setBlueprint, bpPick, setBpPick, bpRef, commitBlueprint, reset: resetBp } = useBlueprint();
  // Surgeon: phase-2 replacement-pool step between "five locked" and the delta reveal.
  const { sgPool, sgInId, setSgInId, sgOutId, setSgOutId, sgResult, setSgResult, sgName, setSgName, sgBusy, sgRef, beginSurgeon, confirmSurgeon, dismissPool: dismissSgPool, reset: resetSg } = useSurgeon(seed, mode, traceRef, setLoading, setError, !!user);

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
  const roundNum = Math.min(filled + 1, 5);
  const rosterKey = useMemo(() => SLOTS.map((s) => roster[s]?.id ?? "").join("|"), [roster]);
  const projAllowed = mode !== "challenge" && projectionAllowed(seed); // a converted challenge carries its classic-<n> seed — responders stay blind (§12)

  const { runSpin, spinning, reel, setReel, lockedReel, setLockedReel, stopReel } = useReelSpin({
    seed, asOf, mode, filled, drafted, genRef, saltRef, roundRespinsRef, setError, setCurrent, setSelPlayer, setSelSlot, setCrowdNote, setSkips,
  });

  // Live projection (Classic / Prime / Blueprint only): after each placement, fetch the floor↔ceiling
  // win band for the roster so far. Read-only, gated server-side too, and never blocks the draft.
  useEffect(() => {
    if (!projAllowed || filled < 1 || filled > 4) return;
    const lineup = rosterKey.split("|").map((id) => id || null);
    const ctrl = new AbortController();
    fetch("/api/project", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seed, asOf, lineup }), signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.floor) setProjection(d as RosterProjection); })
      .catch(() => { /* offline or aborted — keep the last projection on screen */ });
    return () => ctrl.abort();
  }, [seed, asOf, filled, projAllowed, rosterKey]);

  useHoldYourPlace(mode, seed, result, blueprint, sgResult);

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
      writeLastResult({ mode, seed, asOf, result: full, fh: fhPred, bp: blueprint });
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
  }, [mode, seed, asOf, blueprint, user]);

  // Factor Hunt: hook placed after simulate so beginFhPrediction can close over the stable callback.
  const { fhStep, fhPick, setFhPick, fhPrediction, setFhPrediction, fhRef, beginFhPrediction, lockFh, fhFetching, reset: resetFh } = useFactorHunt(seed, simulate, setError);

  // Abandon the current game's in-flight work: bump the generation (runSpin + the crowd note re-check it
  // after every await), stop the reel churn, and cancel any in-flight simulate.
  const abandonInFlight = useCallback(() => {
    genRef.current += 1;
    stopReel();
    abortSimRef.current?.abort(); abortSimRef.current = null;
  }, [stopReel]);

  // start() placed after all per-mode hook calls so it can close over their stable reset functions
  // without triggering react-hooks/immutability (resetFh, resetPickem, resetBp, resetSg all have []
  // deps — but must be declared before start references them).
  const start = useCallback((m: Mode, challenge?: { id: string; role: "create" | "respond"; seed?: string; asOf?: string }) => {
    track("mode_start", { mode: m });
    ev("play", { uid: getUid(), mode: m });
    // once-ever-per-device first-play signal (distinct from replays), attributed to the utm channel.
    // Read the URL FIRST (a cold /play?mode=…&utm_source=… deep-link fires this before UtmCapture's
    // layout effect has persisted the source), falling back to the stored first-touch source — same
    // ordering-robust pattern as Beacon.tsx.
    markFirstPlay(getUid(), currentUtmSource() ?? getUtmSource() ?? undefined, currentRefCode() ?? getRefCode() ?? undefined);
    abandonInFlight(); // cancel the old game's spin / crowd note / simulate
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
    setChallengeId(cid); setChallengeRole(crole); setSeed(s); setAsOf(challenge?.asOf ?? isoDay());
    setRoster(EMPTY); setCurrent(null); setResult(null); setError(null); setLoading(false); setProjection(null);
    setSelPlayer(null); setSelSlot(null); setSkips({ team: false, era: false });
    setReel(initialReel(m)); setLockedReel(null); saltRef.current = 0;
    traceRef.current = []; roundRespinsRef.current = [];
    hintsUsedRef.current = 0; setHintsUsed(0);
    resetPickem(); resetFh(); resetBp(); resetSg();
    setOwnerId(null);
    stripRestoreParams();
  }, [abandonInFlight, resetPickem, resetFh, resetBp, resetSg, setReel, setLockedReel]);

  // "← Modes": abandon the game like start() does (in-flight spin/simulate/FH/Surgeon work) and drop
  // the restore params, or a refresh would resurrect the result the player just walked away from.
  const goToModes = useCallback(() => {
    abandonInFlight(); resetFh(); resetSg(); stripRestoreParams(); setMode(null);
  }, [abandonInFlight, resetFh, resetSg]);

  useRestoreFromUrl(start, setOwnerId, setRestoring, setMode, setSeed, setAsOf, setResult, setFhPrediction, setBlueprint, setSgResult);

  // Mode fork at "five locked": Factor Hunt detours through the prediction step; Surgeon detours
  // through the diagnosis/swap step; everyone else simulates immediately (pre-FH behavior).
  const finishDraft = useCallback((r: Roster) => {
    if (mode === "factorhunt") beginFhPrediction(r);
    else if (mode === "surgeon") beginSurgeon(r);
    else simulate(r);
  }, [mode, beginFhPrediction, beginSurgeon, simulate]);

  const place = useCallback((slot: Slot) => {
    if (!selPlayer || roster[slot] || !selPlayer.eligible.includes(slot)) return;
    setCrowdNote(null); // clear any prior slot's reveal before this lock's fetch resolves
    traceRef.current.push({ slot, pickedId: selPlayer.id, respins: [...roundRespinsRef.current] });
    roundRespinsRef.current = [];
    // Silent crowd-signal beacon: count this pick for the (mode, spin) config. Fired AFTER the slot
    // is committed, so it can never act as a pre-commit hint (DESIGN.md §12). Best-effort, ignored on error.
    if (current) {
      try {
        void fetch("/api/slot-pick", {
          method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
          body: JSON.stringify({ mode, spinKey: `${current.team}|${current.decade}`, slot, personId: selPlayer.person_id ?? selPlayer.id }),
        }).catch(() => {});
      } catch { /* beacon is best-effort */ }
      // Post-lock crowd reveal: how others played THIS slot for this spin. Volume-gated server-side
      // (usually null pre-launch). Post-commit, read-only — never a pre-commit hint. Skipped in HoopIQ
      // to keep its mystery. The read sees plays BEFORE this one, so it reflects how others went.
      if (mode !== "hoopiq") {
        const sp = `${current.team}|${current.decade}`;
        const gen = genRef.current;
        fetch(`/api/crowd?mode=${mode}&spinKey=${encodeURIComponent(sp)}&slot=${slot}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { const top = d?.crowd?.choices?.[0]; if (top && gen === genRef.current) setCrowdNote(`${top.pct}% of players took ${top.name} at ${slot} here.`); })
          .catch(() => {});
      }
    }
    const next = { ...roster, [slot]: selPlayer };
    setRoster(next); setSelPlayer(null); setCurrent(null); setLockedReel(null);
    if (SLOTS.every((s) => next[s])) finishDraft(next);
    // Placing a pick collapses the tall candidate browser (the next pick needs a fresh spin), so the
    // page shrinks and the scroll position clamps below the reels — leaving the player scrolled past
    // the reels + turn count (reported mobile bug). Bring the viewport back to the top on the next
    // frame, after the collapse re-renders: shows the reels for the next spin, or the result reveal on
    // the final pick.
    if (typeof window !== "undefined") requestAnimationFrame(() => scrollToTop());
  }, [selPlayer, roster, finishDraft, current, mode, setLockedReel]);

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
  const showBpModal = mode === "blueprint" && !blueprint && !restoring;

  // Focus management for the vote overlay, the Factor Hunt prediction, the Blueprint commit and the
  // Surgeon swap dialogs (same pattern as the mobile position sheet in DraftView).
  useDialogFocus(showPickem, pickemRef);
  useDialogFocus(fhStep, fhRef);
  useDialogFocus(showBpModal, bpRef);
  useDialogFocus(sgPool, sgRef);

  if (restoring) return <div className="mx-auto max-w-4xl px-4 py-6"><ResultSkeleton label="Loading your result…" /></div>;
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
  // Draft Duel runs its own draft (shared spins vs a server-side bot) — see components/game/DuelGame.
  if (mode === "duel") return <DuelGame onModeSelect={goToModes} />;
  if (mode === "surgeon" && sgResult) return (
    <SurgeonResultView mode={mode} seed={seed} sgResult={sgResult} onRestart={() => start("surgeon")} onModeSelect={goToModes} />
  );
  if (result) return (
    <GameResultView mode={mode} seed={seed} asOf={asOf} result={result} roundNum={roundNum} onRestart={() => start(mode)} onModeSelect={goToModes}
      onCreateChallenge={() => start("challenge")} pickem={{ vote: pickemVote, crowd: pickemCrowd, subject: pickemSubject }}
      fhPrediction={fhPrediction} blueprint={blueprint} challengeId={challengeId} challengeRole={challengeRole} />
  );
  if (loading) return (
    <Shell roundNum={5} mode={mode} onRestart={() => start(mode)} onModeSelect={goToModes} showRestart>
      <ResultSkeleton label={mode === "surgeon" ? "Diagnosing your lineup…" : mode === "factorhunt" ? "Building your question…" : "Running all 82 games…"} />
    </Shell>
  );

  return (
    <Shell roundNum={roundNum} mode={mode} onRestart={() => start(mode)} onModeSelect={goToModes} showRestart={filled > 0 || !!current}>
      <DraftView mode={mode} roster={roster} current={current} reel={reel} lockedReel={lockedReel} spinning={spinning} blueprint={blueprint}
        projAllowed={projAllowed} projection={projection} skips={skips} selPlayer={selPlayer} selSlot={selSlot} hintsUsed={hintsUsed}
        crowdNote={crowdNote} error={error} loading={loading} fhFetching={fhFetching}
        onSpin={spin} onReSpinTeam={reSpinTeam} onReSpinEra={reSpinEra} onRevealHint={revealHint}
        onSelectCandidate={(c) => { setSelSlot(null); setSelPlayer((p) => (p?.id === c.id ? null : c)); }}
        onFinish={() => finishDraft(roster)} onRestart={() => start(mode)} onSlot={clickSlot} slotTarget={slotTarget}
        onCancelSelection={() => { setSelPlayer(null); setSelSlot(null); }} />

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
