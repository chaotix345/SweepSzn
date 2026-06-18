import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { XIcon } from "@/components/ui/icons";

// Static credibility stats (mirrors the calibration facts in the homepage SEO copy).
const STATS: [string, string][] = [
  ["24,687", "player-seasons"],
  ["1,170", "NBA team-seasons"],
  ["5.6", "win RMSE (out-of-sample, luck-adjusted)"],
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div>
            <div className="font-display text-2xl tracking-wide">
              Sweep<span className="text-orange-500">Szn</span>
            </div>
            <p className="mt-2 max-w-xs text-sm text-zinc-400">
              Can you go 82-0? Draft an all-time NBA five and find out. It&apos;s sweep season.
            </p>
            <div className="mt-4 flex items-center gap-4">
              <ButtonLink href="/play" size="sm">
                Draft your five →
              </ButtonLink>
              <a
                href="https://x.com/SweepSeason"
                target="_blank"
                rel="noreferrer"
                aria-label="Follow SweepSzn on X (@SweepSeason)"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-400 transition hover:text-zinc-100"
              >
                <XIcon /> @SweepSeason
              </a>
            </div>
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
            <Link href="/play" className="text-zinc-400 hover:text-zinc-100">Play</Link>
            <Link href="/leaderboards" className="text-zinc-400 hover:text-zinc-100">Leaderboards</Link>
            <Link href="/how-it-works" className="text-zinc-400 hover:text-zinc-100">How it works</Link>
            <Link href="/about" className="text-zinc-400 hover:text-zinc-100">About</Link>
          </nav>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-zinc-800/70 pt-5 text-xs text-zinc-600">
          {STATS.map(([n, label]) => (
            <span key={label}>
              <span className="font-mono font-bold text-zinc-400">{n}</span> {label}
            </span>
          ))}
          <span className="sm:ml-auto">© 2026 SweepSzn · Free · runs in your browser</span>
        </div>
      </div>
    </footer>
  );
}
