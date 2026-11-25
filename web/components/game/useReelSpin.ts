import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { FRANCHISES, DECADES, eraLabel } from "@/lib/teams";
import type { DraftCandidate, Slot } from "@/lib/types";
import type { Mode } from "@/components/game/types";
import type { Spin, SpinOpts } from "@/components/game/gameState";

export type ReelValue = { team: string; era: string };
export const initialReel = (m: Mode | null): ReelValue => ({ team: "ATL", era: m === "prime" ? "PRIME" : "60's" });

// The spin request + the cosmetic reel churn around it. Owns the reel display state; everything the
// spin touches outside the reels (current spin, selection, re-spin bookkeeping) is passed in.
export function useReelSpin(opts: {
  seed: string;
  mode: Mode | null;
  filled: number;
  drafted: DraftCandidate[];
  genRef: RefObject<number>;
  saltRef: RefObject<number>;
  roundRespinsRef: RefObject<("team" | "era")[]>;
  setError: (e: string | null) => void;
  setCurrent: (s: Spin | null) => void;
  setSelPlayer: (c: DraftCandidate | null) => void;
  setSelSlot: (s: Slot | null) => void;
  setCrowdNote: (n: string | null) => void;
  setSkips: Dispatch<SetStateAction<{ team: boolean; era: boolean }>>;
}) {
  const { seed, mode, filled, drafted, genRef, saltRef, roundRespinsRef, setError, setCurrent, setSelPlayer, setSelSlot, setCrowdNote, setSkips } = opts;
  const [spinning, setSpinning] = useState(false);
  const [reel, setReel] = useState<ReelValue>(initialReel(null));
  const [lockedReel, setLockedReel] = useState<"team" | "era" | null>(null);
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (tickRef.current) clearTimeout(tickRef.current); }, []);

  const runSpin = useCallback(async (spinOpts: SpinOpts, locked: "team" | "era" | null = null) => {
    if (spinning) return;
    const gen = genRef.current;
    const stale = () => gen !== genRef.current; // restarted / left for the picker mid-spin — drop everything
    setError(null); setSpinning(true); setCurrent(null); setSelPlayer(null); setSelSlot(null); setLockedReel(locked); setCrowdNote(null);
    if (tickRef.current) clearTimeout(tickRef.current);
    const reduce = typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
    // Cosmetic reel churn: a fast blur while the (deterministic) spin resolves, then a slot-machine
    // deceleration over the fixed floor so the value visibly clicks into place. Self-rescheduling
    // setTimeout (not setInterval) so the ramp can slow per-tick. The result and the 1100ms floor
    // below are untouched — 82-0 parity holds; the tick is purely visual. Skipped under reduced-motion.
    const churn = () => setReel({
      team: locked === "team" ? spinOpts.lockedTeam! : FRANCHISES[Math.floor(Math.random() * FRANCHISES.length)],
      // Prime Draft: the era reel never cycles — it's permanently locked to PRIME
      era: mode === "prime" ? "PRIME" : locked === "era" ? eraLabel(spinOpts.lockedDecade!) : eraLabel(DECADES[Math.floor(Math.random() * DECADES.length)]),
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
        body: JSON.stringify({ seed, round: filled, exclude: drafted.map((p) => p.id), fit: mode === "classic" || mode === "prime" || mode === "blueprint", ...spinOpts }),
      });
      if (stale()) return;
      if (!r.ok) throw new Error("spin failed");
      const res: Spin = await r.json();
      if (stale()) return;
      // result known — restart the churn as a deceleration ramp from the first (fast) step
      if (!reduce) { if (tickRef.current) clearTimeout(tickRef.current); decel = true; step = 0; schedule(); }
      await new Promise((rs) => setTimeout(rs, 1100));
      if (stale()) return;
      if (tickRef.current) { clearTimeout(tickRef.current); tickRef.current = null; }
      setReel({ team: res.team, era: eraLabel(res.decade) });
      setCurrent(res);
      // a single haptic "click" at the landing — Android only; iOS/desktop silently no-op
      if (!reduce) { try { navigator.vibrate?.(35); } catch { /* no haptics */ } }
    } catch {
      if (stale()) return; // the rollback below would hit the NEXT game's skips/salt
      setLockedReel(null); setReel(initialReel(mode));
      // roll back the re-spin we optimistically charged before this call so a network error doesn't
      // silently burn the skip (and don't leave a phantom re-spin in the verification trace)
      if (locked === "era") setSkips((s) => ({ ...s, team: false }));
      else if (locked === "team") setSkips((s) => ({ ...s, era: false }));
      // also roll back the pre-incremented salt — the next successful re-spin must reuse this salt
      // value, or verifyTrace (which counts only the re-spins in the trace) would reject the submit.
      if (locked !== null) { roundRespinsRef.current = roundRespinsRef.current.slice(0, -1); saltRef.current--; }
      setError("Network hiccup — tap SPIN to try again.");
    } finally {
      if (!stale()) { if (tickRef.current) clearTimeout(tickRef.current); setSpinning(false); }
    }
  }, [spinning, seed, filled, drafted, mode, genRef, saltRef, roundRespinsRef, setError, setCurrent, setSelPlayer, setSelSlot, setCrowdNote, setSkips]);

  // Stop the reel churn (used when a game is abandoned mid-spin).
  const stopReel = useCallback(() => {
    if (tickRef.current) { clearTimeout(tickRef.current); tickRef.current = null; }
    setSpinning(false);
  }, []);

  return { runSpin, spinning, reel, setReel, lockedReel, setLockedReel, stopReel };
}
