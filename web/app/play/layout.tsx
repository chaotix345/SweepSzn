import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SkipLink from "@/components/SkipLink";
import Beacon from "@/components/Beacon";

// The game route: shared header for navigation, but no footer — keep the play view focused.
export const metadata: Metadata = {
  title: "Play SweepSzn — draft your all-time five",
  description: "Spin a franchise reel and an era reel, draft a five-player all-time NBA lineup, and simulate a full 82-game season. Can you go 82-0?",
  alternates: { canonical: "/play" },
};

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* /play is a genuine entry surface (direct + deep-link arrivals). Count it as a visit so the
          visitor→first-play denominator — and sourceSplit.visit per utm channel — isn't missing the
          deep-link path. Device-scoped key shared with home, so landing → play is one visit. */}
      <Beacon name="visit" dedupe={{ scope: "device", key: "szn:ev:visit" }} />
      <SkipLink />
      <SiteHeader />
      <main id="main-content" className="flex-1">{children}</main>
    </div>
  );
}
