import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";

// Server component: the shared header for every multi-section share permalink (/r/, /pe/, /sg/,
// /compare/, /dex/s/). One source of truth for the wordmark + a contextual tagline + an above-the-
// fold play CTA — so a cold X arrival always has an unmistakable orange path into the game, and no
// page can quietly drift back to a CTA-less header (which is how /pe/ + /sg/ ended up with none).
// CTA is md (≥44px tap target) and the action orange (DESIGN.md: the only CTA color).
export default function ShareHeader({
  tagline,
  cta,
  ctaHref = "/play",
}: {
  tagline: string;
  cta: string;
  ctaHref?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <Link href="/" className="flex items-baseline text-2xl tracking-tight">
        <span className="font-display">Sweep<span className="text-orange-500">Szn</span></span>
        <span className="ml-3 text-sm font-semibold text-zinc-500">{tagline}</span>
      </Link>
      <ButtonLink href={ctaHref} size="md">{cta}</ButtonLink>
    </div>
  );
}
