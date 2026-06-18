import { describe, it, expect } from "vitest";
import { buildBadgeNotification, notificationText } from "@/lib/notify";

describe("buildBadgeNotification + badge-unlock copy", () => {
  it("builds a deterministic badge_unlock notif (id collapses dupes)", () => {
    const n = buildBadgeNotification("sTier", "Perfection", 1000);
    expect(n.type).toBe("badge_unlock");
    expect(n.id).toBe("badge:sTier");
    expect(n.badge).toBe("sTier");
    expect(n.name).toBe("Perfection");
    expect(n.ts).toBe(1000);
  });

  it("renders title/body referencing the badge name and the Dex", () => {
    const t = notificationText(buildBadgeNotification("sTier", "Perfection", 1000));
    expect(t.title).toMatch(/Perfection/);
    expect(t.body).toMatch(/Dex/i);
  });

  it("still renders challenge-response copy unchanged", () => {
    const t = notificationText({
      id: "x", type: "challenge_response", challengeId: "c", opponent: "Bob",
      outcome: "beaten", tookLead: false, oppWins: 55, oppLosses: 27, yourWins: 50, yourLosses: 32, ts: 1,
    });
    expect(t.title).toMatch(/Bob/);
  });
});
