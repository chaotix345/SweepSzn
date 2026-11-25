import { useEffect } from "react";
import { parseModeParam } from "@/lib/modeParam";
import { encodeLineup, decodeShare } from "@/lib/share";
import { readLastResult } from "@/lib/resultHistory";
import { bpCode, bpFromCode, type BlueprintKey } from "@/lib/blueprint";
import type { Mode } from "@/components/game/types";
import { todaySeed, type GameResult, type LastResult } from "@/components/game/gameState";
import type { SgResult } from "@/components/game/useSurgeon";

type StartFn = (m: Mode, challenge?: { id: string; role: "create" | "respond"; seed?: string }) => void;

// Bootstrap the view from the URL (hold-your-place restore on refresh). Priority: a joiner deep link
// (?c=<id>) → respond mode; then a creator dashboard (?own=<id>); then a finished-result restore
// (?r=<encoded>&m=<mode>). A bare URL falls through to the mode picker. (async IIFE keeps start()'s
// setState out of the effect body for react-hooks/set-state-in-effect.)
export function useRestoreFromUrl(
  start: StartFn,
  setOwnerId: (id: string | null) => void,
  setRestoring: (v: boolean) => void,
  setMode: (m: Mode | null) => void,
  setSeed: (s: string) => void,
  setResult: (r: GameResult | null) => void,
  setFhPrediction: (p: string | null) => void,
  setBlueprint: (b: BlueprintKey | null) => void,
  setSgResult: (r: SgResult | null) => void,
) {
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

        // Deep-link straight into a mode (skip the picker) for cold first-timers: /play?mode=daily.
        // Lower priority than ?c=/?own= above; challenge is excluded (it needs ?c=<id> to replay the
        // creator's seed), so /play?mode=challenge — and anything unknown — falls through to the picker.
        // Mutually exclusive with the ?r=/?sg= restore params in practice. Mirrors the ?c= cleanup so a
        // later refresh restores from ?r= (not this fresh-start param).
        const dl = parseModeParam(params.get("mode"));
        if (dl) {
          if (cancelled) return;
          start(dl);
          // A fresh start owns the URL: drop ?mode= AND any restore params (?r=/?m=/?own=/?d=/?sg=) so a
          // later refresh can't resurrect a stale result. start() already strips them from the LIVE url,
          // but `params` is the pre-start snapshot — clean it too before this replaceState rewrites the bar.
          for (const k of ["mode", "r", "m", "own", "d", "sg"]) params.delete(k);
          const qs = params.toString();
          window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
          return;
        }

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
  }, [start, setOwnerId, setRestoring, setMode, setSeed, setResult, setFhPrediction, setBlueprint, setSgResult]);
}
