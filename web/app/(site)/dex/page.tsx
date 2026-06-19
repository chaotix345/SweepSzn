import type { Metadata } from "next";
import { DexBoard } from "@/components/DexBoard";
import { marketingMetadata } from "@/lib/marketingMeta";

export const metadata: Metadata = { ...marketingMetadata("dex"), alternates: { canonical: "/dex" } };

export default function DexPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <DexBoard />
    </div>
  );
}
