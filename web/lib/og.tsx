import type { LineupResult, Player } from "./types";
import { SLOTS, teamColors, initials, eraLabel, displayName } from "./teams";
import { headline } from "./explain";

// Shared building blocks for the dynamic Open Graph cards (next/og + satori).
// Satori only supports flexbox + a CSS subset, so every multi-child node sets display:flex
// and colors are hex (no Tailwind classes here).

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "82-0 — build an all-time NBA starting five";

const GRADE_HEX: Record<string, string> = {
  S: "#e879f9", "A+": "#4ade80", A: "#4ade80", B: "#60a5fa", C: "#fbbf24", D: "#94a3b8", F: "#f87171",
};

// satori's default font is latin-only; strip diacritics so names like Dončić/Jokić don't tofu.
const ascii = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");

function Wordmark({ size = 40 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", fontSize: size, fontWeight: 800, letterSpacing: -1 }}>
      <span style={{ color: "#fafafa" }}>82</span>
      <span style={{ color: "#f97316" }}>-0</span>
    </div>
  );
}

const shell = {
  width: "100%", height: "100%", display: "flex", flexDirection: "column" as const,
  background: "linear-gradient(135deg, #18181b 0%, #0a0a0a 60%)",
  color: "#fafafa", padding: "56px 64px", fontFamily: "sans-serif",
};

export function resultOgElement(result: LineupResult, players: Player[]) {
  const grade = GRADE_HEX[result.grade] ?? "#e4e4e7";
  const net = `${result.netRtg > 0 ? "+" : ""}${result.netRtg.toFixed(1)}`;
  return (
    <div style={shell}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <Wordmark />
          <span style={{ marginLeft: 16, fontSize: 22, color: "#a1a1aa", fontWeight: 600 }}>all-time starting five</span>
        </div>
        <span style={{ display: "flex", fontSize: 22, color: "#71717a" }}>projected 82-game record</span>
      </div>

      {/* record + grade */}
      <div style={{ display: "flex", alignItems: "center", marginTop: 24, gap: 40 }}>
        <div style={{ display: "flex", alignItems: "baseline", fontSize: 150, fontWeight: 900, lineHeight: 1, color: grade }}>
          <span>{result.wins}</span><span style={{ color: "#3f3f46" }}>–</span><span>{result.losses}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 46, fontWeight: 800 }}>
            <span style={{ color: grade }}>{result.grade}</span>
            <span style={{ marginLeft: 14, color: "#e4e4e7" }}>{result.label}</span>
          </div>
          <div style={{ display: "flex", marginTop: 12, fontSize: 26, color: "#a1a1aa" }}>
            Net {net} · ORtg {result.ortg.toFixed(1)} · DRtg {result.drtg.toFixed(1)}
          </div>
        </div>
      </div>

      {/* players */}
      <div style={{ display: "flex", marginTop: "auto", gap: 14 }}>
        {players.map((p, i) => {
          const c = teamColors(p.team);
          return (
            <div key={p.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 201 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 76, height: 76, borderRadius: 16, background: c.bg, color: c.text }}>
                <span style={{ fontSize: 26, fontWeight: 800 }}>{initials(p.name)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, marginTop: 1 }}>{SLOTS[i]}</span>
              </div>
              <span style={{ marginTop: 12, fontSize: 21, fontWeight: 700, color: "#fafafa" }}>{ascii(displayName(p.name))}</span>
              <span style={{ marginTop: 2, fontSize: 15, color: "#71717a" }}>{p.team} · {eraLabel(p.decade)}</span>
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 28 }}>
        <span style={{ display: "flex", fontSize: 22, color: "#a1a1aa", maxWidth: 820 }}>{ascii(headline(result))}</span>
        <span style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "#f97316" }}>Can you beat it?</span>
      </div>
    </div>
  );
}

export function brandOgElement(sub: string) {
  return (
    <div style={{ ...shell, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <Wordmark size={130} />
      <span style={{ display: "flex", marginTop: 28, fontSize: 40, fontWeight: 700, color: "#fafafa" }}>{sub}</span>
      <span style={{ display: "flex", marginTop: 20, fontSize: 26, color: "#a1a1aa" }}>
        Engine calibrated to 1,170 real NBA team-seasons — and it tells you why.
      </span>
    </div>
  );
}
