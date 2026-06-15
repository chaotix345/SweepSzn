import type { Mode } from "@/components/game/types";

// Monochrome, stroke-based mode glyphs (currentColor) that take each mode's accent via the wrapping
// tile's text color — replaces the system emoji that clashed with the broadcast aesthetic and
// rendered differently across OS font stacks.
const SVG = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function ModeGlyph({ mode, className }: { mode: Mode; className?: string }) {
  const p = { width: 24, height: 24, viewBox: "0 0 24 24", "aria-hidden": true as const, className, ...SVG };
  switch (mode) {
    case "daily": // calendar — a fresh slate each day
      return (<svg {...p}><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" /></svg>);
    case "classic": // bar chart — full stats visible
      return (<svg {...p}><line x1="5" y1="21" x2="5" y2="13" /><line x1="12" y1="21" x2="12" y2="8" /><line x1="19" y1="21" x2="19" y2="3" /></svg>);
    case "hoopiq": // eye with a slash — stats hidden, draft from memory
      return (<svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7a11 11 0 0 1-5.6-1.5" /><circle cx="12" cy="12" r="2.4" /><line x1="3" y1="3" x2="21" y2="21" /></svg>);
    case "factorhunt": // magnifier — predict the engine's verdict
      return (<svg {...p}><circle cx="10.5" cy="10.5" r="6.5" /><line x1="21" y1="21" x2="15.5" y2="15.5" /></svg>);
    case "prime": // lightning — every legend at his peak
      return (<svg {...p}><polygon points="13 2 4 14 11 14 10 22 19 9 12 9 13 2" /></svg>);
    case "blueprint": // gridded plan — commit to a tactic
      return (<svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="9" x2="9" y2="21" /></svg>);
    case "surgeon": // ECG pulse — diagnose and fix
      return (<svg {...p}><polyline points="2 12 7 12 10 5 14 19 17 12 22 12" /></svg>);
    case "challenge": // send — build a five, send a link
      return (<svg {...p}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>);
  }
}
