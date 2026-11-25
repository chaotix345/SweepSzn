"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { msToNextUtcMidnight } from "@/lib/streak";

const hhmmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

// Hydration-safe "mounted" flag (the Game/ResultCard useSyncExternalStore pattern): false on the server
// and during hydration, true after — so the time-dependent countdown can't mismatch the server HTML.
const subscribeNoop = () => () => {};
const getMounted = () => true;
const getServerMounted = () => false;

// The next-Daily countdown ("hh:mm:ss" to 00:00 UTC), ticking every second. "--:--:--" until mounted.
// Shared by the leaderboard header and the Daily result's come-back block (D9: one countdown).
export function useNextDailyCountdown(): string {
  const mounted = useSyncExternalStore(subscribeNoop, getMounted, getServerMounted);
  const [countdown, setCountdown] = useState(() => msToNextUtcMidnight());
  useEffect(() => {
    const t = setInterval(() => setCountdown(msToNextUtcMidnight()), 1000);
    return () => clearInterval(t);
  }, []);
  return mounted ? hhmmss(countdown) : "--:--:--";
}
