import type { MetadataRoute } from "next";
import { baseUrl } from "@/lib/site";

// Single-page app: the homepage is the only indexable route (/r/[lineup] is noindex).
export default function sitemap(): MetadataRoute.Sitemap {
  // Fixed lastModified (not new Date()) so the value is stable across requests rather than
  // churning to the request time on every sitemap fetch.
  return [
    { url: baseUrl, lastModified: "2026-06-08", changeFrequency: "daily", priority: 1 },
  ];
}
