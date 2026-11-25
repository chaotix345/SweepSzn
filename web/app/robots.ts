import type { MetadataRoute } from "next";
import { baseUrl } from "@/lib/site";

// Public pages are open to every crawler (incl. /r/ permalinks — they must stay crawlable so social/OG
// unfurlers can fetch their share-card images; they're kept out of search by their own `noindex`
// metadata). /admin and the JSON API are disallowed.
//
// AI search and answer crawlers get their own group, so the allow is explicit rather than inherited.
// A crawler that matches a named group ignores the `*` group, so it repeats the same disallows.
const DISALLOW = ["/admin", "/api/"];
const AI_CRAWLERS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "ClaudeBot", "Claude-SearchBot", "Claude-User",
  "PerplexityBot", "Perplexity-User",
  "Google-Extended", "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
