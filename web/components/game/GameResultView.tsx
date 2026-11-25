"use client";
import { useState } from "react";
import { type Mode, MODE_LABEL } from "@/components/game/types";
import { Shell } from "@/components/game/Shell";
import type { LeaderboardView } from "@/lib/types";
import { SLOTS } from "@/lib/teams";
import ResultCard from "@/components/ResultCard";
import Leaderboard from "@/components/Leaderboard";
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
import { useDailyCeiling } from "@/components/game/useDailyCeiling";
import DailyComeback from "@/components/DailyComeback";
import CeilingReveal from "@/components/CeilingReveal";
import { Button, ButtonLink } from "@/components/ui/Button";
import { dayUTC, shortDay } from "@/lib/day";
import { canShareAsChallenge, createShareChallenge } from "@/lib/challengeShare";
import { getUid, getName } from "@/lib/streak";
import { encodeLineup } from "@/lib/share";
import { saveResult } from "@/lib/resultHistory";
import { pushResult } from "@/lib/account";
import { useSessionContext } from "@/components/SessionProvider";
import { track } from "@vercel/analytics";
import Link from "next/link";

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
    </Shell>
  );
}

export function GameResultView({ mode, seed, asOf, result, roundNum, onRestart, onModeSelect, onCreateChallenge, pickem, fhPrediction, blueprint, challengeId, challengeRole }: {
  mode: Mode; seed: string; asOf: string; result: GameResult; roundNum: number;
  onRestart: () => void; onModeSelect: () => void; onCreateChallenge: () => void;
  pickem: { vote: PickemVote | null; crowd: { y: number; n: number } | null; subject: string | null };
  fhPrediction: string | null; blueprint: BlueprintKey | null;
  challengeId: string | null; challengeRole: "create" | "respond" | null;
}) {
  const [lbView, setLbView] = useState<LeaderboardView | null>(null); // daily standing for the result-card pill
  const { user } = useSessionContext();
  const [convertedId, setConvertedId] = useState<string | null>(null); // challenge minted from a finished game
  const [sharedChallengeId, setSharedChallengeId] = useState<string | null>(null); // created by Share (D6)
  // D6: a Classic/Prime result's Share creates a Challenge on the same seed (fit-locked server-side).
  // Remembered under "Your results" like a converted challenge, so the creator can reopen the dashboard.
  // (a challenge RESPONDER replays the creator's classic/prime seed — their share stays the /r/ claim)
  const challengeShare = (mode === "classic" || mode === "prime") && canShareAsChallenge(seed, result.trace) ? {
    create: async () => {
      const id = await createShareChallenge({ seed, asOf, trace: result.trace, usedHints: result.usedHints }, { uid: user?.uid ?? getUid(), name: getName() });
      if (!id) return null;
      const saved = saveResult({ encoded: encodeLineup(result.players.map((p) => p.id), result.usedHints), mode: "challenge", wins: result.result.wins, losses: result.result.losses, grade: result.result.grade, challengeId: id });
      if (user) void pushResult(saved);
      track("challenge_submit", { role: "creator" });
      setSharedChallengeId(id);
      return `/c/${id}`;
    },
  } : undefined;
  // W2: today's ceiling record, fetched only once the board shows a verified submission for this viewer
  const ceiling = useDailyCeiling(mode === "daily" ? seed.replace("daily-", "") : null, mode === "daily" && !!lbView?.you);
  const [streak, setStreak] = useState(0); // the board's streak (server when signed in), for the come-back block
  const dailyDate = mode === "daily" ? seed.replace("daily-", "") : null;
  const dailyToday = dailyDate !== null && dailyDate === dayUTC(); // the one "is today's live Daily" check
  const daily = dailyDate !== null ? { date: dailyDate, live: dailyToday } : undefined;

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
      <ResultCard result={result.result} players={result.players} slots={SLOTS} mode={MODE_LABEL[mode]} modeKey={mode} usedHints={result.usedHints} onReset={onRestart} pickem={pickemView} factorHunt={fhView}
        prime={mode === "prime" || seed.startsWith("prime-")} blueprint={bpView}
        lbRank={mode === "daily" && lbView?.you ? { rank: lbView.you.rank, total: lbView.total } : null} ceiling={ceiling}
        challengeShare={challengeShare} daily={daily}
        afterActions={dailyToday ? <DailyComeback streak={streak} /> : undefined} />
      {/* F02: at most ONE secondary action under the card. Classic/Prime: Share already is the
          challenge, so this is the link to its live dashboard once created. Daily/HoopIQ: the explicit
          "challenge a friend" convert (below). Modes with no challenge keep the referral invite. */}
      {sharedChallengeId && (
        <Link href={`/play?own=${sharedChallengeId}`}
          className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-zinc-700 px-3 text-sm font-semibold text-zinc-200 hover:border-zinc-500">
          ⚔️ Your challenge is live · See who&apos;s played →
        </Link>
      )}
      {(mode === "factorhunt" || mode === "blueprint") && <InviteFriend />}
      {mode === "daily" && <Leaderboard date={seed.replace("daily-", "")} trace={result.trace} usedHints={result.usedHints} readOnly={result.trace.length === 0} onView={setLbView} onStreak={setStreak} />}
      {/* a past day's Daily result (restored from its permalink): that day's revealed perfect five */}
      {dailyDate !== null && !dailyToday && <CeilingReveal date={dailyDate} yourWins={result.result.wins} />}
      {mode === "factorhunt" && <FhLeaderboard date={seed.replace("fh-", "")} trace={result.trace} prediction={fhPrediction} readOnly={result.trace.length === 0} />}
      {mode === "blueprint" && blueprint && <BpLeaderboard date={seed.replace("bp-", "")} trace={result.trace} blueprint={blueprint} usedHints={result.usedHints} readOnly={result.trace.length === 0} />}
      {mode === "challenge" && challengeId && challengeRole && (
        <ChallengeResult id={challengeId} role={challengeRole} seed={seed} asOf={asOf} usedHints={false} result={result.result} players={result.players}
          trace={result.trace} onCreateOwn={onCreateChallenge} />
      )}
      {/* Daily/HoopIQ convert to an H2H challenge explicitly. Classic/Prime do it through Share (D6);
          FH/Blueprint/Surgeon seeds can't convert (the challenge store doesn't accept them). */}
      {(mode === "daily" || mode === "hoopiq") && (convertedId ? (
        // Convert THIS finished five into a real H2H challenge in place, carrying the original seed:
        // the friend drafts the same teams/eras and tries to beat this exact record — no re-draft.
        <ChallengeResult id={convertedId} role="create" seed={seed} asOf={asOf} usedHints={result.usedHints}
          result={result.result} players={result.players} trace={result.trace} />
      ) : (
        <button onClick={() => setConvertedId(newChallengeId())}
          className="mt-3 min-h-11 w-full rounded-xl border border-zinc-700 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500">
          ⚔️ Challenge a friend to beat this
        </button>
      ))}
    </Shell>
  );
}

// W3 past-Daily archive: an unranked replay of a rolled-over Daily on that day's pool. No board, no
// streak, no weekly/all-time credit (the daily submit route only takes today's date, and this view never
// mounts the Leaderboard); the payoff is the revealed perfect five and how this run did against it.
export function ArchiveResultView({ date, result, onRestart, onModeSelect, onPlayToday }: {
  date: string; result: GameResult; onRestart: () => void; onModeSelect: () => void; onPlayToday: () => void;
}) {
  const label = `Archive · ${shortDay(date)}`;
  return (
    <Shell roundNum={5} mode="daily" label={label} onRestart={onRestart} onModeSelect={onModeSelect} showRestart>
      <ResultCard result={result.result} players={result.players} slots={SLOTS} mode={label} modeKey="archive" usedHints={result.usedHints} onReset={onRestart}
        afterActions={<>
          <p className="mt-3 text-center text-xs text-zinc-400" data-testid="archive-unranked">Unranked replay: no leaderboard, streak or weekly credit.</p>
          <CeilingReveal date={date} yourWins={result.result.wins} />
        </>} />
      <div className="mt-4 grid gap-2 sm:flex sm:gap-3">
        <ButtonLink href="/archive" variant="secondary" className="flex-1">← All past Dailies</ButtonLink>
        <Button variant="primary" onClick={onPlayToday} className="flex-1">Play today&apos;s Daily →</Button>
      </div>
    </Shell>
  );
}
