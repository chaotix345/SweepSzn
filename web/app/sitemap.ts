import type { MetadataRoute } from "next";
import { baseUrl } from "@/lib/site";

// Indexable routes only. The share permalinks (/r/, /c/, /rank/) are intentionally excluded —
// they carry their own `noindex` metadata. /admin is disallowed in robots.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  // Fixed lastModified (not new Date()) so the value is stable across requests.
  const lastModified = "2026-06-09";
  return [
    { url: baseUrl, lastModified, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/play`, lastModified, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/how-it-works`, lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/leaderboards`, lastModified, changeFrequency: "daily", priority: 0.6 },
    { url: `${baseUrl}/about`, lastModified, changeFrequency: "monthly", priority: 0.5 },
  ];
}
