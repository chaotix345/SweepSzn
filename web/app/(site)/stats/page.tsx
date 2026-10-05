import type { Metadata } from "next";
import StatsBoard from "@/components/StatsBoard";

// Personal page (reads this device's history + the signed-in account's): never indexed, not in the sitemap.
export const metadata: Metadata = {
  title: "Your stats — SweepSzn",
  description: "Your SweepSzn progress at a glance: games played, best records by mode, grades, and your Daily streak.",
  robots: { index: false },
};

export default function StatsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <StatsBoard />
    </div>
  );
}
