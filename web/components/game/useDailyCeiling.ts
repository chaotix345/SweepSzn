"use client";
import { useEffect, useState } from "react";
import { getUid } from "@/lib/streak";

export type DailyCeiling = { wins: number; losses: number };

// Today's Daily ceiling record (W2). Asked for only once the board confirms a verified submission
// (`verified`), and the server re-checks that itself (DESIGN.md §12). The anon uid rides the POST
// body, never a URL; signed in, the session decides. Any failure (no Redis, no auth, offline) hides it.
export function useDailyCeiling(date: string | null, verified: boolean): DailyCeiling | null {
  const [ceiling, setCeiling] = useState<{ date: string; c: DailyCeiling } | null>(null);
  useEffect(() => {
    if (!date || !verified) return;
    const ctl = new AbortController();
    fetch("/api/daily/ceiling", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, uid: getUid() }), signal: ctl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        const c = v?.ceiling;
        if (c && typeof c.wins === "number" && typeof c.losses === "number") setCeiling({ date, c: { wins: c.wins, losses: c.losses } });
      })
      .catch(() => { /* quietly hidden */ });
    return () => ctl.abort();
  }, [date, verified]);
  return verified && ceiling && ceiling.date === date ? ceiling.c : null;
}
