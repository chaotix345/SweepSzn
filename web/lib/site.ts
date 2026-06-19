// Single source of truth for the site's absolute base URL.
// Prefer the stable production domain, fall back to the per-deploy preview URL, then local.
// Used by app/layout.tsx (metadataBase + canonical), robots.ts, sitemap.ts, and JSON-LD.
export const baseUrl =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const SITE_NAME = "SweepSzn";

// The brand's X account — one source of truth for the handle (twitter card site/creator + the
// "via @SweepSeason" share-credit) and the profile URL (footer follow link + JSON-LD sameAs).
export const X_HANDLE = "@SweepSeason";
export const X_URL = "https://x.com/SweepSeason";
