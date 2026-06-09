import { buildChallengeNotification, unreadCount, notificationText, validateSubscription, NOTIF_CAP } from "./notify";
import type { Notif } from "./types";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

// ---- buildChallengeNotification: deterministic shape, no RNG ----
const base = { challengeId: "abc12345", opponent: "Sam", oppWins: 74, oppLosses: 8, yourWins: 72, yourLosses: 10, ts: 1717977600000 };
const beaten = buildChallengeNotification({ ...base, outcome: "beaten", tookLead: true });
assert(beaten.type === "challenge_response", "type is challenge_response");
assert(beaten.challengeId === "abc12345", "challengeId carried");
assert(beaten.id === "abc12345:1717977600000:Sam", "id is deterministic (challenge:ts:opponent), no RNG");
assert(beaten.opponent === "Sam" && beaten.outcome === "beaten" && beaten.tookLead === true, "fields carried through");
assert(beaten.oppWins === 74 && beaten.oppLosses === 8 && beaten.yourWins === 72 && beaten.yourLosses === 10, "records carried");
assert(buildChallengeNotification({ ...base, outcome: "beaten", tookLead: true }).id === beaten.id, "same inputs -> same id (pure)");

// ---- unreadCount: ts strictly greater than the watermark ----
const items: Pick<Notif, "ts">[] = [{ ts: 30 }, { ts: 20 }, { ts: 10 }];
assert(unreadCount(items, 0) === 3, "watermark 0 -> all unread");
assert(unreadCount(items, 20) === 1, "watermark 20 -> only ts>20 unread (the 30)");
assert(unreadCount(items, 30) === 0, "watermark at newest -> none unread");
assert(unreadCount([], 0) === 0, "empty -> 0 unread");

// ---- notificationText: outcome-aware copy, from the creator's POV ----
const tBeatLead = notificationText(beaten);
assert(/#1/.test(tBeatLead.title), "beaten + tookLead -> title mentions #1");
assert(/reclaim/i.test(tBeatLead.body), "beaten body nudges to reclaim");
const tBeat = notificationText(buildChallengeNotification({ ...base, outcome: "beaten", tookLead: false }));
assert(tBeat.title === "Sam beat your 72-10", "beaten (no lead) -> 'Sam beat your 72-10'");
assert(/74-8/.test(tBeat.body), "beaten body shows the responder's record");
const tTie = notificationText(buildChallengeNotification({ ...base, outcome: "tied", tookLead: false }));
assert(/tied your 72-10/.test(tTie.title), "tied -> mentions tied your record");
const tHeld = notificationText(buildChallengeNotification({ ...base, outcome: "held", tookLead: false }));
assert(/Sam/.test(tHeld.title) && /held/i.test(tHeld.body), "held -> friend took it but you held");
// empty opponent name falls back gracefully
assert(/Someone/.test(notificationText(buildChallengeNotification({ ...base, opponent: "", outcome: "beaten", tookLead: false })).title), "blank opponent -> 'Someone'");

// ---- validateSubscription: shape gate at the trust boundary ----
const goodSub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BPpk...", auth: "k9...", }, expirationTime: null };
const v = validateSubscription(goodSub);
assert(!!v && v.endpoint === goodSub.endpoint && v.keys.p256dh === "BPpk..." && v.keys.auth === "k9...", "valid FCM sub passes and is normalized to {endpoint,keys}");
// known push providers are allowed
assert(!!validateSubscription({ endpoint: "https://updates.push.services.mozilla.com/wpush/v2/abc", keys: { p256dh: "a", auth: "b" } }), "Mozilla autopush host allowed");
assert(!!validateSubscription({ endpoint: "https://db5p.notify.windows.com/w/?token=abc", keys: { p256dh: "a", auth: "b" } }), "WNS (*.notify.windows.com) host allowed");
assert(!!validateSubscription({ endpoint: "https://web.push.apple.com/abc", keys: { p256dh: "a", auth: "b" } }), "Apple web push host allowed");
// SSRF guard: an arbitrary https host is rejected even with valid keys
assert(validateSubscription({ endpoint: "https://attacker.example.com/probe", keys: { p256dh: "a", auth: "b" } }) === null, "non-push host rejected (SSRF guard)");
assert(validateSubscription({ endpoint: "https://evil.notify.windows.com.attacker.com/x", keys: { p256dh: "a", auth: "b" } }) === null, "look-alike host (suffix spoof) rejected");
assert(validateSubscription({ endpoint: "http://insecure/x", keys: { p256dh: "a", auth: "b" } }) === null, "non-https endpoint rejected");
assert(validateSubscription({ endpoint: "https://fcm.googleapis.com/y", keys: { p256dh: "a" } }) === null, "missing auth key rejected");
assert(validateSubscription({ endpoint: "https://fcm.googleapis.com/y" }) === null, "missing keys rejected");
assert(validateSubscription({ keys: { p256dh: "a", auth: "b" } }) === null, "missing endpoint rejected");
assert(validateSubscription(null) === null, "null rejected");
assert(validateSubscription("nope") === null, "non-object rejected");
assert(validateSubscription({ endpoint: "https://fcm.googleapis.com/" + "a".repeat(2000), keys: { p256dh: "a", auth: "b" } }) === null, "over-long endpoint rejected");
assert(validateSubscription({ endpoint: "https://fcm.googleapis.com/y", keys: { p256dh: "a".repeat(500), auth: "b" } }) === null, "over-long key rejected");

assert(NOTIF_CAP === 50, "NOTIF_CAP is 50");

console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL NOTIFY CHECKS PASSED");
process.exit(fail ? 1 : 0);
