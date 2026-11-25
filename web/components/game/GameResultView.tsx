"use client";
import { useState } from "react";
import { type Mode, MODE_LABEL } from "@/components/game/types";
import { Shell } from "@/components/game/Shell";
import type { LeaderboardView } from "@/lib/types";
import { SLOTS } from "@/lib/teams";
import { showsSaveNudge } from "@/lib/signinNudge";
import ResultCard from "@/components/ResultCard";
import Leaderboard from "@/components/Leaderboard";
import SignInSaveNudge from "@/components/SignInSaveNudge";
import ChallengeResult from "@/components/ChallengeResult";
import InviteFriend from "@/components/InviteFriend";
import { newChallengeId } from "@/lib/challenge";
import { pickemSeedOk, getLocalVote, type PickemVote } from "@/lib/pickem";
import { buildFhChoices } from "@/lib/factorHunt";
import FhLeaderboard from "@/components/FhLeaderboard";
import { gradeBlueprint, type BlueprintKey } from "@/lib/blueprint";
import BpLeaderboard from "@/components/BpLeaderboard";
import SurgeonResult from "@/components/SurgeonResult";
import SgLeaderboard from "@/components/SgLeaderboard";
import type { GameResult } from "@/components/game/gameState";
import type { SgResult } from "@/components/game/useSurgeon";

// Surgeon reveal: its own before/after layout + delta board, not the single-lineup ResultCard.
export function SurgeonResultView({ mode, seed, sgResult, onRestart, onModeSelect }: {
  mode: Mode; seed: string; sgResult: SgResult; onRestart: () => void; onModeSelect: () => void;
}) {
  return (
    <Shell roundNum={5} mode={mode} onRestart={onRestart} onModeSelect={onModeSelect} showRestart>
      <SurgeonResult before={sgResult.before} after={sgResult.after} beforePlayers={sgResult.beforePlayers}
        afterPlayers={sgResult.afterPlayers} outIdx={sgResult.outIdx} diagnosis={sgResult.diagnosis}
        card={sgResult.card} onReset={onRestart} />
      <InviteFriend />
      <SgLeaderboard date={seed.replace("surgeon-", "")} preloaded={sgResult.view} />
      {showsSaveNudge(mode) && <SignInSaveNudge mode={mode} />}
    </Shell>
  );
}

export function GameResultView({ mode, seed, result, roundNum, onRestart, onModeSelect, onCreateChallenge, pickem, fhPrediction, blueprint, challengeId, challengeRole }: {
  mode: Mode; seed: string; result: GameResult; roundNum: number;
  onRestart: () => void; onModeSelect: () => void; onCreateChallenge: () => void;
  pickem: { vote: PickemVote | null; crowd: { y: number; n: number } | null; subject: string | null };
  fhPrediction: string | null; blueprint: BlueprintKey | null;
  challengeId: string | null; challengeRole: "create" | "respond" | null;
}) {
  const [lbView, setLbView] = useState<LeaderboardView | null>(null); // daily standing for the result-card pill
  const [convertedId, setConvertedId] = useState<string | null>(null); // challenge minted from a finished game

  // Pick'Em crowd-vs-you strip data for the result card (vote falls back to the per-seed local
  // copy so a Daily replay in the same browser still shows your pick when the API is dark).
  const effPickemVote = pickem.vote ?? (pickemSeedOk(seed) ? getLocalVote(seed) : null);
  const pickemView = mode !== "challenge" && (effPickemVote || pickem.crowd)
    ? { y: pickem.crowd?.y ?? 0, n: pickem.crowd?.n ?? 0, vote: effPickemVote, subject: pickem.subject }
    : undefined;
  // Factor Hunt verdict chip: recompute the answer from the revealed factors (same pure helper
  // the server verifies with, so the chip and the board bonus can never disagree).
  const fhView = (() => {
    if (mode !== "factorhunt" || !fhPrediction) return undefined;
    const c = buildFhChoices(result.result.factors, seed);
    return c ? { prediction: fhPrediction, answer: c.answer, correct: fhPrediction === c.answer } : undefined;
  })();
  // Blueprint execution view: graded from the revealed result with the same pure helper the
  // submit route verifies with, so the card strip and the board grade can never disagree.
  const bpView = mode === "blueprint" && blueprint ? gradeBlueprint(blueprint, result.result) : undefined;

  return (
    <Shell roundNum={roundNum} mode={mode} onRestart={onRestart} onModeSelect={onModeSelect} showRestart>
      <ResultCard result={result.result} players={result.players} slots={SLOTS} mode={MODE_LABEL[mode]} modeKey={mode} usedHints={result.usedHints} onReset={onRestart} pickem={pickemView} factorHunt={fhView} prime={mode === "prime"} blueprint={bpView}
        lbRank={mode === "daily" && lbView?.you ? { rank: lbView.you.rank, total: lbView.total } : null} />
      <InviteFriend />
      {mode === "daily" && <Leaderboard date={seed.replace("daily-", "")} trace={result.trace} usedHints={result.usedHints} readOnly={result.trace.length === 0} onView={setLbView} />}
      {/* Every non-Daily result gets the minimal save/keep-streak sign-in nudge — not just the
          board-less Classic/HoopIQ/Prime, but also the FactorHunt/Blueprint/Challenge results that
          previously left a signed-out share-link arrival with no reason to make an account. Daily is
          excluded: its Leaderboard already prompts sign-in with the richer claim-your-rank flow. */}
      {showsSaveNudge(mode) && <SignInSaveNudge mode={mode} />}
      {mode === "factorhunt" && <FhLeaderboard date={seed.replace("fh-", "")} trace={result.trace} prediction={fhPrediction} readOnly={result.trace.length === 0} />}
      {mode === "blueprint" && blueprint && <BpLeaderboard date={seed.replace("bp-", "")} trace={result.trace} blueprint={blueprint} usedHints={result.usedHints} readOnly={result.trace.length === 0} />}
      {mode === "challenge" && challengeId && challengeRole && (
        <ChallengeResult id={challengeId} role={challengeRole} seed={seed} usedHints={false} result={result.result} players={result.players}
          trace={result.trace} onCreateOwn={onCreateChallenge} />
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
}
