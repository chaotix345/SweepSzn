import { describe, it, expect } from "vitest";
import { buildChallengeNotification, unreadCount, notificationText, validateSubscription, NOTIF_CAP } from "./notify";
import type { Notif } from "./types";

// ---- buildChallengeNotification: deterministic shape, no RNG ----
const base = { challengeId: "abc12345", opponent: "Sam", oppWins: 74, oppLosses: 8, yourWins: 72, yourLosses: 10, ts: 1717977600000 };
const beaten = buildChallengeNotification({ ...base, outcome: "beaten", tookLead: true });

describe("buildChallengeNotification", () => {
  it("type is challenge_response", () => {
    expect(beaten.type).toBe("challenge_response");
  });

  it("challengeId carried", () => {
    expect(beaten.challengeId).toBe("abc12345");
  });

  it("id is deterministic (challenge:ts:opponent), no RNG", () => {
    expect(beaten.id).toBe("abc12345:1717977600000:Sam");
  });

  it("fields carried through", () => {
    expect(beaten.opponent === "Sam" && beaten.outcome === "beaten" && beaten.tookLead === true).toBe(true);
  });

  it("records carried", () => {
    expect(beaten.oppWins === 74 && beaten.oppLosses === 8 && beaten.yourWins === 72 && beaten.yourLosses === 10).toBe(true);
  });

  it("same inputs -> same id (pure)", () => {
    expect(buildChallengeNotification({ ...base, outcome: "beaten", tookLead: true }).id).toBe(beaten.id);
  });
});

// ---- unreadCount: ts strictly greater than the watermark ----
const items: Pick<Notif, "ts">[] = [{ ts: 30 }, { ts: 20 }, { ts: 10 }];

describe("unreadCount", () => {
  it("watermark 0 -> all unread", () => {
    expect(unreadCount(items, 0)).toBe(3);
  });

  it("watermark 20 -> only ts>20 unread (the 30)", () => {
    expect(unreadCount(items, 20)).toBe(1);
  });

  it("watermark at newest -> none unread", () => {
    expect(unreadCount(items, 30)).toBe(0);
  });

  it("empty -> 0 unread", () => {
    expect(unreadCount([], 0)).toBe(0);
  });
});

// ---- notificationText: outcome-aware copy, from the creator's POV ----
const tBeatLead = notificationText(beaten);
const tBeat = notificationText(buildChallengeNotification({ ...base, outcome: "beaten", tookLead: false }));
const tTie = notificationText(buildChallengeNotification({ ...base, outcome: "tied", tookLead: false }));
const tHeld = notificationText(buildChallengeNotification({ ...base, outcome: "held", tookLead: false }));

describe("notificationText", () => {
  it("beaten + tookLead -> title mentions #1", () => {
    expect(/#1/.test(tBeatLead.title)).toBe(true);
  });

  it("beaten body nudges to reclaim", () => {
    expect(/reclaim/i.test(tBeatLead.body)).toBe(true);
  });

  it("beaten (no lead) -> 'Sam beat your 72-10'", () => {
    expect(tBeat.title).toBe("Sam beat your 72-10");
  });

  it("beaten body shows the responder's record", () => {
    expect(/74-8/.test(tBeat.body)).toBe(true);
  });

  it("tied -> mentions tied your record", () => {
    expect(/tied your 72-10/.test(tTie.title)).toBe(true);
  });

  it("held -> friend took it but you held", () => {
    expect(/Sam/.test(tHeld.title) && /held/i.test(tHeld.body)).toBe(true);
  });

  // empty opponent name falls back gracefully
  it("blank opponent -> 'Someone'", () => {
    expect(/Someone/.test(notificationText(buildChallengeNotification({ ...base, opponent: "", outcome: "beaten", tookLead: false })).title)).toBe(true);
  });
});

// ---- validateSubscription: shape gate at the trust boundary ----
const goodSub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BPpk...", auth: "k9...", }, expirationTime: null };
const v = validateSubscription(goodSub);

describe("validateSubscription", () => {
  it("valid FCM sub passes and is normalized to {endpoint,keys}", () => {
    expect(!!v && v.endpoint === goodSub.endpoint && v.keys.p256dh === "BPpk..." && v.keys.auth === "k9...").toBe(true);
  });

  // known push providers are allowed
  it("Mozilla autopush host allowed", () => {
    expect(!!validateSubscription({ endpoint: "https://updates.push.services.mozilla.com/wpush/v2/abc", keys: { p256dh: "a", auth: "b" } })).toBe(true);
  });

  it("WNS (*.notify.windows.com) host allowed", () => {
    expect(!!validateSubscription({ endpoint: "https://db5p.notify.windows.com/w/?token=abc", keys: { p256dh: "a", auth: "b" } })).toBe(true);
  });

  it("Apple web push host allowed", () => {
    expect(!!validateSubscription({ endpoint: "https://web.push.apple.com/abc", keys: { p256dh: "a", auth: "b" } })).toBe(true);
  });

  // SSRF guard: an arbitrary https host is rejected even with valid keys
  it("non-push host rejected (SSRF guard)", () => {
    expect(validateSubscription({ endpoint: "https://attacker.example.com/probe", keys: { p256dh: "a", auth: "b" } })).toBe(null);
  });

  it("look-alike host (suffix spoof) rejected", () => {
    expect(validateSubscription({ endpoint: "https://evil.notify.windows.com.attacker.com/x", keys: { p256dh: "a", auth: "b" } })).toBe(null);
  });

  it("non-https endpoint rejected", () => {
    expect(validateSubscription({ endpoint: "http://insecure/x", keys: { p256dh: "a", auth: "b" } })).toBe(null);
  });

  it("missing auth key rejected", () => {
    expect(validateSubscription({ endpoint: "https://fcm.googleapis.com/y", keys: { p256dh: "a" } })).toBe(null);
  });

  it("missing keys rejected", () => {
    expect(validateSubscription({ endpoint: "https://fcm.googleapis.com/y" })).toBe(null);
  });

  it("missing endpoint rejected", () => {
    expect(validateSubscription({ keys: { p256dh: "a", auth: "b" } })).toBe(null);
  });

  it("null rejected", () => {
    expect(validateSubscription(null)).toBe(null);
  });

  it("non-object rejected", () => {
    expect(validateSubscription("nope")).toBe(null);
  });

  it("over-long endpoint rejected", () => {
    expect(validateSubscription({ endpoint: "https://fcm.googleapis.com/" + "a".repeat(2000), keys: { p256dh: "a", auth: "b" } })).toBe(null);
  });

  it("over-long key rejected", () => {
    expect(validateSubscription({ endpoint: "https://fcm.googleapis.com/y", keys: { p256dh: "a".repeat(500), auth: "b" } })).toBe(null);
  });
});

describe("constants", () => {
  it("NOTIF_CAP is 50", () => {
    expect(NOTIF_CAP).toBe(50);
  });
});
