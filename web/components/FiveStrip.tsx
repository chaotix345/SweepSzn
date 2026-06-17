import Link from "next/link";
import type { ChallengeMiniPlayer } from "@/lib/types";
import { teamColors, initials, eraLabel, displayName } from "@/lib/teams";

// A compact, slot-labelled row of a five. Optionally links to the full /r/ result permalink. Shared by
// the responder reveal (ChallengeResult) and the creator dashboard (ChallengeOwner).
export default function FiveStrip({ title, five, href }: { title: string; five: ChallengeMiniPlayer[]; href?: string }) {
  const body = (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        <span>{title}</span>{href && <span className="text-orange-400/80">view →</span>}
      </div>
      <div className="flex justify-between gap-1">
        {five.map((p) => {
          const c = teamColors(p.team);
          return (
            <div key={p.id} className="flex min-w-0 flex-col items-center">
              <div className="flex h-10 w-10 flex-col items-center justify-center rounded-lg text-[10px] font-black leading-none"
                style={{ background: c.bg, color: c.text }}>
                <span>{initials(p.name)}</span><span className="mt-0.5 text-[8px] opacity-80">{p.slot}</span>
              </div>
              <span className="mt-1 w-full truncate text-center text-[10px] text-zinc-300">{displayName(p.name)}</span>
              <span className="text-[9px] text-zinc-500">{p.team} · {eraLabel(p.decade)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
