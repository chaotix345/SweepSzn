import type { Metadata } from "next";
import { DexBoard } from "@/components/DexBoard";

export const metadata: Metadata = {
  title: "Drafted Dex · SweepSzn",
  description: "Every player you've fielded — your personal all-time collection, with milestones to chase.",
};

export default function DexPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <DexBoard />
    </div>
  );
}
