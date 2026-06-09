import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";

// The game route: shared header for navigation, but no footer — keep the play view focused.
export const metadata: Metadata = {
  title: "Play SweepSzn — draft your all-time five",
  description: "Spin a franchise reel and an era reel, draft a five-player all-time NBA lineup, and simulate a full 82-game season. Can you go 82-0?",
  alternates: { canonical: "/play" },
};

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <SiteHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
