"use client";
import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import { getUid } from "@/lib/streak";
import { getOwnRefCode, setOwnRefCode } from "@/lib/referral";

// Result-screen "Invite a friend" CTA. Lazy-mints this device's opaque referral code (cached after the
// first call), then shares/copies an invite link (https://host/?ref=<code>) — a referred friend's
// first_play is credited back to this user and unlocks the cosmetic recruiter/invited badges.
// §12-safe: the code is a public proxy for the user, never the bearer uid.
export default function InviteFriend() {
  // Lazy-init from the cached code so a returning user sees the CTA immediately (this component only
  // ever mounts client-side, post-result — never in the SSR HTML — so reading localStorage here is safe).
  const [code, setCode] = useState<string | null>(() => getOwnRefCode());
  const [credits, setCredits] = useState(0);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/referral", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ uid: getUid() }),
        });
        if (!res.ok || !alive) return;
        const data = (await res.json()) as { code?: string; credits?: number };
        if (!alive) return;
        if (data.code) { setCode(data.code); setOwnRefCode(data.code); }
        if (typeof data.credits === "number") setCredits(data.credits);
      } catch {
        /* invite is best-effort — a failed mint just leaves the CTA hidden */
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!code) return null;
  const link = typeof window !== "undefined" ? `${window.location.origin}/?ref=${code}` : `/?ref=${code}`;

  const invite = async () => {
    track("invite_click", {});
    try {
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
      if (nav.share) { await nav.share({ title: "SweepSzn", text: "Draft your all-time NBA five on SweepSzn", url: link }); return; }
      await navigator.clipboard?.writeText(link);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // user dismissed the native share sheet
      setErr(true); setTimeout(() => setErr(false), 2500);
    }
  };

  return (
    <button onClick={invite}
      className="mt-3 w-full rounded-xl border border-orange-500/50 bg-orange-500/10 py-3 text-sm font-bold text-orange-300 hover:bg-orange-500/20">
      {copied ? "Invite link copied!" : err ? "Copy failed — try again" : credits > 0 ? `Invite a friend → · ${credits} drafted so far` : "Invite a friend →"}
    </button>
  );
}
