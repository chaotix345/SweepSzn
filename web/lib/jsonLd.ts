import { baseUrl, SITE_NAME, X_URL } from "./site";

// Serialize schema.org JSON-LD for a <script type="application/ld+json">, escaping the characters
// that could break out of the script context (same pattern as the existing pages).
export const jsonLdHtml = (o: unknown) =>
  JSON.stringify(o).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

export const breadcrumbLd = (items: [string, string][]) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${baseUrl}${path}` })),
});

export const faqLd = (faq: { q: string; a: string }[]) => ({
  "@type": "FAQPage",
  mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

const HOME_DESCRIPTION =
  "All-time NBA lineup simulator. Draft a starting five by spinning team and era reels. Engine calibrated to 1,170 real NBA team-seasons — and it tells you why your lineup wins or loses.";

export const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${baseUrl}/#website`,
      name: SITE_NAME,
      url: baseUrl,
      description: HOME_DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@type": "WebApplication",
      name: SITE_NAME,
      url: baseUrl,
      description: HOME_DESCRIPTION,
      applicationCategory: "GameApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      genre: "Sports simulation",
      keywords:
        "NBA lineup simulator, all-time NBA team builder, best NBA starting five, NBA fantasy draft game, NBA team builder game",
      isPartOf: { "@id": `${baseUrl}/#website` },
      sameAs: [X_URL],
    },
  ],
};
