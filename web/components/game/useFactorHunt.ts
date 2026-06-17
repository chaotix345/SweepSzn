import { useState, useRef, useCallback } from "react";
import { SLOTS } from "@/lib/teams";
import { track } from "@vercel/analytics";
import type { DraftCandidate, Slot } from "@/lib/types";

type Roster = Record<Slot, DraftCandidate | null>;
type SimulateFn = (r: Roster, fhPred?: string | null) => Promise<void>;

export function useFactorHunt(seed: string, simulate: SimulateFn, setError: (e: string | null) => void) {
  const [fhStep, setFhStep] = useState<{ roster: Roster; ask: "worst" | "best"; choices: string[] } | null>(null);
  const [fhPick, setFhPick] = useState<string | null>(null);            // highlighted choice (not yet locked)
  const [fhPrediction, setFhPrediction] = useState<string | null>(null); // locked choice (null = skipped)
  const [fhFetching, setFhFetching] = useState(false);                   // choices fetch in flight (button feedback)
  const fhFetchingRef = useRef(false);                                  // de-dupes the choices fetch
  const fhAbortRef = useRef<AbortController | null>(null);              // cancels an in-flight choices fetch on restart
  const fhRef = useRef<HTMLDivElement>(null);                           // prediction dialog

  // Factor Hunt prediction step: fetch the choice set (server-built — only {ask, choices} is on
  // the wire, never the answer or the record), then hold the reveal until the player locks/skips.
  // Any failure falls straight through to a normal reveal with no bonus — never blocks the game.
  const beginFhPrediction = useCallback(async (r: Roster) => {
    if (fhFetchingRef.current) return;
    fhFetchingRef.current = true; setFhFetching(true); setError(null);
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
    } finally { fhFetchingRef.current = false; setFhFetching(false); }
  }, [seed, simulate, setError]);

  const lockFh = useCallback((choice: string | null) => {
    if (!fhStep) return;
    const r = fhStep.roster;
    setFhPrediction(choice); setFhStep(null); setFhPick(null);
    track("fh_predict", { locked: choice ? 1 : 0 });
    simulate(r, choice);
  }, [fhStep, simulate]);

  const reset = useCallback(() => {
    fhAbortRef.current?.abort(); fhAbortRef.current = null;
    setFhStep(null); setFhPick(null); setFhPrediction(null); fhFetchingRef.current = false;
  }, []);

  return { fhStep, fhPick, setFhPick, fhPrediction, setFhPrediction, fhRef, beginFhPrediction, lockFh, fhFetching, reset };
}
