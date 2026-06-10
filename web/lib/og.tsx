import type { LineupResult, Player } from "./types";
import { SLOTS, teamColors, initials, eraLabel, displayName } from "./teams";
import { headline } from "./explain";
import type { RankCard } from "./rankShare";
import { pickemVerdict, type PickemView } from "./pickem";

// Shared building blocks for the dynamic Open Graph cards (next/og + satori).
// Satori only supports flexbox + a CSS subset, so every multi-child node sets display:flex
// and colors are hex (no Tailwind classes here).

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "SweepSzn — build an all-time NBA starting five";

const GRADE_HEX: Record<string, string> = {
  S: "#ffc53d", "A+": "#ffc53d", A: "#4ade80", B: "#60a5fa", C: "#fbbf24", D: "#94a3b8", F: "#f87171",
};

// satori's default font is latin-only; strip diacritics so names like Dončić/Jokić don't tofu.
const ascii = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");

function Wordmark({ size = 40 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", fontSize: size, fontWeight: 900, letterSpacing: -1 }}>
      <span style={{ color: "#fafafa" }}>Sweep</span>
      <span style={{ color: "#ff6a00" }}>Szn</span>
    </div>
  );
}

const shell = {
  width: "100%", height: "100%", display: "flex", flexDirection: "column" as const,
  background: "linear-gradient(135deg, #18181b 0%, #0a0a0a 60%)",
  color: "#fafafa", padding: "56px 64px", fontFamily: "sans-serif",
};

// Crowd-vs-you strip for Pick'Em share cards: split bar + verdict (satori = flex only, hex only).
// Solo votes (no crowd counts — Redis dark) render the self-prediction verdict with no bar,
// matching ResultCard's PickemStrip.
function pickemStrip(result: LineupResult, pickem: PickemView) {
  const v = pickemVerdict(result.wins, pickem);
  if (!v.total && !pickem.vote) return null;
  const yPct = v.total ? Math.round((100 * pickem.y) / v.total) : 0;
  const verdict = v.solo
    ? `You said ${pickem.vote === "y" ? "60+ wins" : "no shot"} — ${v.youRight ? "you called it" : "not this time"}`
    : v.crowd === null
      ? "The crowd was split down the middle"
      : `Crowd said ${v.crowd === "y" ? "60+ wins" : "no shot"} (${v.pct}%) — ${v.crowdRight ? "the crowd was right" : v.defied ? "you defied the crowd" : "the crowd was wrong"}`;
  // Verdict color tells the story at a glance: green for a hit (you called it / you defied the
  // crowd / the crowd was right), red for a miss, neutral when the crowd split with no majority.
  const good = v.solo ? v.youRight === true : v.defied || v.crowdRight === true;
  const verdictColor = !v.solo && v.crowd === null ? "#a1a1aa" : good ? "#34d399" : "#f87171";
  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", fontSize: 20, fontWeight: 700, letterSpacing: 2, color: "#a1a1aa" }}>PICK&apos;EM — CROWD VS. YOU</span>
        <span style={{ display: "flex", fontSize: 21, fontWeight: 700, color: verdictColor }}>{verdict}</span>
      </div>
      {v.total > 0 && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", height: 16, borderRadius: 8, overflow: "hidden", marginTop: 10, width: "100%", background: "#27272a" }}>
            {yPct > 0 && <div style={{ display: "flex", width: `${yPct}%`, background: "#34d399" }} />}
            {yPct < 100 && <div style={{ display: "flex", width: `${100 - yPct}%`, background: "#f87171" }} />}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 17, color: "#71717a" }}>
            <span style={{ display: "flex" }}>YES 60+ · {yPct}%</span>
            <span style={{ display: "flex" }}>NO · {100 - yPct}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Blueprint badge data for the OG card: the committed objective + its execution grade.
export type OgBlueprint = { label: string; grade: string };

export function resultOgElement(result: LineupResult, players: Player[], hinted = false, pickem?: PickemView, prime = false, blueprint?: OgBlueprint) {
  const grade = GRADE_HEX[result.grade] ?? "#e4e4e7";
  const net = `${result.netRtg > 0 ? "+" : ""}${result.netRtg.toFixed(1)}`;
  // Render the strip first so the record size and the strip can never disagree (a truthy pickem
  // whose strip returns null must NOT shrink the record).
  const strip = pickem ? pickemStrip(result, pickem) : null;
  return (
    <div style={shell}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <Wordmark />
          <span style={{ marginLeft: 16, fontSize: 22, color: "#a1a1aa", fontWeight: 600 }}>all-time starting five</span>
          {blueprint && (
            <span style={{ display: "flex", alignSelf: "center", marginLeft: 16, padding: "5px 14px", borderRadius: 999, background: "rgba(34,211,238,0.14)", color: "#22d3ee", fontSize: 18, fontWeight: 800, letterSpacing: 1 }}>
              📐 {blueprint.label} · {blueprint.grade}
            </span>
          )}
          {!blueprint && prime && (
            <span style={{ display: "flex", alignSelf: "center", marginLeft: 16, padding: "5px 14px", borderRadius: 999, background: "rgba(139,92,246,0.18)", color: "#a78bfa", fontSize: 18, fontWeight: 800, letterSpacing: 1 }}>PRIME</span>
          )}
          {hinted && (
            <span style={{ display: "flex", alignSelf: "center", marginLeft: 16, padding: "5px 14px", borderRadius: 999, background: "rgba(74,222,128,0.14)", color: "#4ade80", fontSize: 18, fontWeight: 700 }}>HINTS USED</span>
          )}
        </div>
        <span style={{ display: "flex", fontSize: 22, color: "#71717a" }}>{blueprint ? "committed before the spin" : prime ? "fantasy simulation · peak eras" : "projected 82-game record"}</span>
      </div>

      {/* record + grade (record shrinks a notch when the Pick'Em strip needs the vertical room) */}
      <div style={{ display: "flex", alignItems: "center", marginTop: 24, gap: 40 }}>
        <div style={{ display: "flex", alignItems: "baseline", fontSize: strip ? 116 : 150, fontWeight: 900, lineHeight: 1, color: grade }}>
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

      {strip}

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
        <span style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "#ff6a00" }}>Can you beat it?</span>
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

// H2H challenge card: shows the bar to beat (record + grade) and a CTA — NO player tokens,
// so a recipient can't copy the creator's five before drafting their own.
export function challengeOgElement(creatorName: string, r: { wins: number; losses: number; net: number; grade: string }) {
  const grade = GRADE_HEX[r.grade] ?? "#e4e4e7";
  const net = `${r.net > 0 ? "+" : ""}${r.net.toFixed(1)}`;
  return (
    <div style={shell}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <Wordmark />
          <span style={{ marginLeft: 16, fontSize: 22, color: "#a1a1aa", fontWeight: 600 }}>head-to-head challenge</span>
        </div>
        <span style={{ display: "flex", fontSize: 22, color: "#71717a" }}>same draft · your picks</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", marginBottom: "auto" }}>
        <span style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#e4e4e7" }}>{ascii(creatorName)} went</span>
        <div style={{ display: "flex", alignItems: "center", gap: 36, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 150, fontWeight: 900, lineHeight: 1, color: grade }}>
            <span>{r.wins}</span><span style={{ color: "#3f3f46" }}>–</span><span>{r.losses}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ display: "flex", fontSize: 46, fontWeight: 800, color: grade }}>{r.grade}</span>
            <span style={{ display: "flex", marginTop: 8, fontSize: 26, color: "#a1a1aa" }}>Net {net}</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#fafafa" }}>Can you beat it?</span>
        <span style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "#ff6a00" }}>Build your five →</span>
      </div>
    </div>
  );
}

// Share-your-rank card: shows the sharer's leaderboard standing + a CTA. Snapshot from the URL.
export function rankOgElement(c: RankCard) {
  const scopeLabel = c.scope === "daily" ? "Daily leaderboard" : c.scope === "week" ? "Weekly leaderboard" : "All-time leaderboard";
  const net = `${c.net > 0 ? "+" : ""}${c.net.toFixed(1)}`;
  const metric = c.scope === "daily" ? `${c.wins}–${c.losses} · Net ${net}` : `${c.wins.toLocaleString()} career wins`;
  return (
    <div style={shell}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <Wordmark />
          <span style={{ marginLeft: 16, fontSize: 22, color: "#a1a1aa", fontWeight: 600 }}>{scopeLabel}</span>
        </div>
        <span style={{ display: "flex", fontSize: 22, color: "#71717a" }}>my rank</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", marginBottom: "auto" }}>
        <span style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#e4e4e7" }}>{ascii(c.name)} is</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 24, marginTop: 6 }}>
          <span style={{ display: "flex", fontSize: 170, fontWeight: 900, lineHeight: 1, color: "#ff6a00" }}>#{c.rank}</span>
          <span style={{ display: "flex", fontSize: 34, color: "#a1a1aa" }}>of {c.total.toLocaleString()}</span>
        </div>
        <span style={{ display: "flex", marginTop: 14, fontSize: 30, color: "#e4e4e7" }}>{metric}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#fafafa" }}>Can you rank higher?</span>
        <span style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "#ff6a00" }}>Build your five →</span>
      </div>
    </div>
  );
}
