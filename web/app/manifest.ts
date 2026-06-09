import type { MetadataRoute } from "next";

// PWA manifest (Next auto-links it as /manifest.webmanifest). Enables "Add to Home Screen" — required
// for web push on iOS Safari (standalone install). Colors follow the Arena design system (web/DESIGN.md).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SweepSzn — Can you go 82-0?",
    short_name: "SweepSzn",
    description: "Draft an all-time NBA five and chase an undefeated season.",
    start_url: "/play",
    display: "standalone",
    background_color: "#0A0A0B",
    theme_color: "#0A0A0B",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
    ],
  };
}
