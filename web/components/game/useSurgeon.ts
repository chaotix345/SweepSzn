import { useState, useRef, useCallback, type RefObject } from "react";
import { SLOTS } from "@/lib/teams";
import { getUid, getName, setName as persistName } from "@/lib/streak";
import { writeLastResult, saveResult } from "@/lib/resultHistory";
import { track } from "@vercel/analytics";
import type { DraftCandidate, DraftStep, LineupResult, Player, Slot } from "@/lib/types";
import type { SurgeonCandidate, SurgeonDiagnosis, SurgeonBoardView } from "@/lib/surgeon";
import type { Mode } from "@/components/game/types";

type Roster = Record<Slot, DraftCandidate | null>;

type SgPool = { diagnosis: SurgeonDiagnosis; before: { wins: number; losses: number; net: number; grade: string }; candidates: SurgeonCandidate[]; roster: { slot: Slot; player: DraftCandidate }[] };
export type SgResult = {
  view: SurgeonBoardView | null; delta: number; card: string; diagnosis: SurgeonDiagnosis;
  before: LineupResult; beforePlayers: Player[]; after: LineupResult; afterPlayers: Player[]; outIdx: number;
};

export function useSurgeon(
  seed: string,
  mode: Mode | null,
  traceRef: RefObject<DraftStep[]>,
  setLoading: (v: boolean) => void,
  setError: (e: string | null) => void,
) {
  // Surgeon: phase-2 replacement-pool step between "five locked" and the delta reveal.
  const [sgPool, setSgPool] = useState<SgPool | null>(null);            // dealt pool + diagnosis (dialog open)
  const [sgInId, setSgInId] = useState<string | null>(null);            // chosen replacement candidate
  const [sgOutId, setSgOutId] = useState<string | null>(null);          // chosen drafted player to drop
  const [sgResult, setSgResult] = useState<SgResult | null>(null);      // submit response (the reveal)
  const [sgName, setSgName] = useState("");                             // board name, captured at swap-confirm
  const [sgBusy, setSgBusy] = useState(false);                          // submit in flight — keeps the dialog mounted (global `loading` would swap it for the spinner screen)
  const sgFetchingRef = useRef(false);                                  // de-dupes the pool fetch
  const sgAbortRef = useRef<AbortController | null>(null);              // cancels in-flight pool/submit on restart
  const sgRef = useRef<HTMLDivElement>(null);                           // swap dialog

  // dismiss must also ABORT an in-flight submit/pool fetch — otherwise a resolving
  // submit re-renders the reveal over the draft board (and its error copy references
  // a dialog that is no longer on screen)
  const dismissPool = useCallback(() => {
    sgAbortRef.current?.abort(); setSgBusy(false); setSgPool(null);
  }, []);

  // Surgeon phase 2: post the trace to /api/surgeon/pool — the server replays it, diagnoses the
  // worst factor, and deals 3 targeted candidates with WHY each (never an after-value). Any failure
  // surfaces as an error with a retry; no offline fallback (the pool is a server computation).
  const beginSurgeon = useCallback(async (r: Roster) => {
    if (sgFetchingRef.current) return;
    sgFetchingRef.current = true; setLoading(true); setError(null);
    sgAbortRef.current?.abort();
    const ctrl = new AbortController();
    sgAbortRef.current = ctrl;
    try {
      const res = await fetch("/api/surgeon/pool", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ seed, trace: traceRef.current }), signal: ctrl.signal,
      });
      const d = await res.json().catch(() => null);
      if (ctrl.signal.aborted) return;
      if (res.status === 422) {
        // degenerate roster: the engine found no factors / no legal replacement — only a redraft helps
        setError("No legal replacement exists for this five — hit Restart and draft again.");
        return;
      }
      if (!res.ok) throw new Error("pool failed");
      if (!d?.diagnosis || !Array.isArray(d?.candidates) || d.candidates.length === 0) throw new Error("bad pool");
      const drafted = SLOTS.map((s) => (r[s] ? { slot: s, player: r[s]! } : null)).filter(Boolean) as { slot: Slot; player: DraftCandidate }[];
      setSgName(getName()); setSgInId(null); setSgOutId(null);
      setSgPool({ diagnosis: d.diagnosis, before: d.before, candidates: d.candidates, roster: drafted });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (ctrl.signal.aborted) return;
      setError("Couldn't read the diagnosis — tap Diagnose to retry.");
    } finally { sgFetchingRef.current = false; if (!ctrl.signal.aborted) setLoading(false); }
  }, [seed, traceRef, setLoading, setError]);

  // Surgeon submit = the reveal. The server recomputes the pool, rejects an off-pool swap,
  // write-once locks the swap, and recomputes the delta itself — client values are never trusted.
  const confirmSurgeon = useCallback(async () => {
    if (!sgPool || !sgInId || !sgOutId || sgBusy) return;
    setSgBusy(true); setError(null);
    sgAbortRef.current?.abort();
    const ctrl = new AbortController();
    sgAbortRef.current = ctrl;
    try {
      const res = await fetch("/api/surgeon/submit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: seed.replace("surgeon-", ""), trace: traceRef.current, uid: getUid(), name: sgName.trim(), outId: sgOutId, inId: sgInId }),
        signal: ctrl.signal,
      });
      const d = await res.json();
      if (ctrl.signal.aborted) return;
      if (!res.ok) { setError(d?.error === "stale date" ? "Today's case just reset — start today's Surgeon to post." : d?.error ?? "submit failed"); return; }
      if (sgName.trim()) persistName(sgName.trim());
      const outIdx = (d.beforePlayers as Player[]).findIndex((p) => p.id === d.swap.outId);
      // a server response whose locked swap doesn't match its own before-lineup should never
      // happen — but an outIdx of -1 would crash SurgeonResult, so refuse it instead
      if (outIdx < 0 || outIdx > 4) { setError("Result looked corrupted — tap Confirm swap to retry."); return; }
      const full: SgResult = { view: d.view, delta: d.delta, card: d.card, diagnosis: d.diagnosis, before: d.before, beforePlayers: d.beforePlayers, after: d.after, afterPlayers: d.afterPlayers, outIdx };
      setSgResult(full); setSgPool(null);
      writeLastResult({ mode, seed, sg: full });
      saveResult({ encoded: d.card, mode: "surgeon", wins: d.after.wins, losses: d.after.losses, grade: d.after.grade });
      track("surgeon_submit", { delta: d.delta, rank: d.view?.you?.rank ?? 0 });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (ctrl.signal.aborted) return;
      setError("Network error — tap Confirm swap to retry.");
    } finally { if (!ctrl.signal.aborted) setSgBusy(false); }
  }, [sgPool, sgInId, sgOutId, sgName, seed, mode, traceRef, sgBusy, setError]);

  const reset = useCallback(() => {
    sgAbortRef.current?.abort(); sgAbortRef.current = null;
    setSgPool(null); setSgInId(null); setSgOutId(null); setSgResult(null); setSgBusy(false); sgFetchingRef.current = false;
  }, []);

  return { sgPool, sgInId, setSgInId, sgOutId, setSgOutId, sgResult, setSgResult, sgName, setSgName, sgBusy, sgRef, beginSurgeon, confirmSurgeon, dismissPool, reset };
}
