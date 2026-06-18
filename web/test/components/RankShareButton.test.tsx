// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/ev", () => ({ ev: vi.fn() }));
vi.mock("@/lib/streak", () => ({ getUid: () => "test-uid" }));

import RankShareButton from "@/components/RankShareButton";
import type { RankCard } from "@/lib/rankShare";

const CARD: RankCard = { scope: "daily", rank: 3, total: 120, name: "Charlie", wins: 55, losses: 27, net: 4.2 };

describe("RankShareButton — share credits the account", () => {
  it("the X intent text credits the @SweepSeason account so rank shares drive follows", () => {
    const { container, getByText } = render(<RankShareButton card={CARD} />);
    // platform links live behind the popover in non-native environments (jsdom has no navigator.share)
    fireEvent.click(getByText("Share rank"));
    const x = container.querySelector('a[href*="twitter.com/intent/tweet"]')?.getAttribute("href") ?? "";
    expect(x).not.toBe("");
    expect(decodeURIComponent(x)).toContain("via @SweepSeason");
  });
});
