import type { MetadataRoute } from "next";
import { baseUrl } from "@/lib/site";

// Allow everything (incl. /r/ permalinks — they must stay crawlable so social/OG unfurlers can
// fetch their share-card images; they're kept out of search by their own `noindex` metadata).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/admin" },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
