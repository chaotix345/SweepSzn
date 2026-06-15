// Meta-test: every route file under app/api/**/route.ts must have a covering test file in
// test/routes/. Fail with a helpful message naming the uncovered route, so adding a new route
// without a test is caught immediately in CI.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd());

// Recursively collect all route.ts files under app/api/
function findRouteFiles(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findRouteFiles(full, found);
    } else if (entry.isFile() && entry.name === "route.ts") {
      found.push(full);
    }
  }
  return found;
}

const API_DIR = path.join(ROOT, "app", "api");
const TEST_ROUTES_DIR = path.join(ROOT, "test", "routes");

// Convert a route.ts absolute path to a canonical route path relative to app/api/
// e.g. .../app/api/daily/submit/route.ts  → "daily/submit"
function routeKey(abs: string): string {
  return path.relative(API_DIR, path.dirname(abs)).split(path.sep).join("/");
}

// Explicit mapping: route key → test file basename (without .test.ts extension)
// Adding a new route without updating this table fails the mapping-completeness check.
// These 5 entries (surgeon/*, blueprint/*) are the ones written as part of PR B alongside
// this meta-test; they are included here from the start.
const ROUTE_TO_TEST: Record<string, string> = {
  "auth/google":                    "authGoogle",
  "auth/me":                        "authMe",
  "auth/nonce":                     "authNonce",
  "auth/signout":                   "authSignout",
  "blueprint/leaderboard":          "blueprintLeaderboard",
  "blueprint/submit":               "blueprintSubmit",
  "board/alltime":                  "boardAlltime",
  "board/weekly":                   "boardWeekly",
  "challenge/[id]":                 "challengeId",
  "challenge/[id]/board":           "challengeBoard",
  "challenge/[id]/results":         "challengeIdResults",
  "challenge/submit":               "challengeSubmit",
  "cron/streak-saver":              "cronStreakSaver",
  "daily/leaderboard":              "dailyLeaderboard",
  "daily/submit":                   "dailySubmit",
  "ev":                             "ev",
  "evaluate":                       "evaluate",
  "factorhunt/choices":             "factorhuntChoices",
  "factorhunt/leaderboard":         "factorhuntLeaderboard",
  "factorhunt/submit":              "factorhuntSubmit",
  "notifications":                  "notifications",
  "notifications/read":             "notificationsRead",
  "pickem":                         "pickem",
  "profile":                        "profile",
  "profile/name":                   "profileName",
  "profile/sync":                   "profileSync",
  "push/subscribe":                 "pushSubscribe",
  "push/unsubscribe":               "pushUnsubscribe",
  "spin":                           "spin",
  "surgeon/leaderboard":            "surgeonLeaderboard",
  "surgeon/pool":                   "surgeonPool",
  "surgeon/submit":                 "surgeonSubmit",
};

describe("route coverage meta-test", () => {
  const routeFiles = findRouteFiles(API_DIR);
  const routeKeys = routeFiles.map(routeKey);

  // 1. Every route file in app/api/ must appear in the mapping table.
  it("every route.ts has an entry in ROUTE_TO_TEST mapping", () => {
    const unmapped = routeKeys.filter((k) => !(k in ROUTE_TO_TEST));
    expect(
      unmapped,
      `Routes without a ROUTE_TO_TEST mapping:\n${unmapped.map((k) => `  app/api/${k}/route.ts`).join("\n")}\n\nAdd an entry to ROUTE_TO_TEST in routeCoverage.meta.test.ts`,
    ).toHaveLength(0);
  });

  // 2. Every entry in the mapping table points to a test file that actually exists.
  it("every mapped test file exists on disk", () => {
    const missing: string[] = [];
    for (const [route, testBase] of Object.entries(ROUTE_TO_TEST)) {
      const testFile = path.join(TEST_ROUTES_DIR, `${testBase}.test.ts`);
      if (!fs.existsSync(testFile)) {
        missing.push(`${route} → test/routes/${testBase}.test.ts`);
      }
    }
    expect(
      missing,
      `Mapped test files that do not exist yet:\n${missing.map((m) => `  ${m}`).join("\n")}\n\nCreate the missing test files or correct the mapping`,
    ).toHaveLength(0);
  });

  // 3. No route in app/api/ is missing from the mapping (checked per-route for clear failure messages).
  for (const key of routeKeys) {
    it(`route app/api/${key}/route.ts is covered by a test`, () => {
      expect(
        ROUTE_TO_TEST,
        `Route app/api/${key}/route.ts has no entry in ROUTE_TO_TEST — add: "${key}": "<testFileBasename>"`,
      ).toHaveProperty(key);

      const testBase = ROUTE_TO_TEST[key];
      const testFile = path.join(TEST_ROUTES_DIR, `${testBase}.test.ts`);
      expect(
        fs.existsSync(testFile),
        `Test file test/routes/${testBase}.test.ts mapped from route ${key} does not exist`,
      ).toBe(true);
    });
  }
});
