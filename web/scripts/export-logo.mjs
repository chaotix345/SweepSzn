// Brand asset exporter -> <repo>/logo/ (gitignored; regenerate any time).
// Requires sharp, which is NOT a project dep: npm i --no-save sharp, then: node scripts/export-logo.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../../logo", import.meta.url));
mkdirSync(OUT, { recursive: true });

const INK = "#0a0a0b";
const WHITE = "#fafafa";
const ORANGE = "#ff6a00";

// Monogram: heavy "S" + orange sweep bar. Faithful to the favicon concept, refined proportions.
// Single letter, so a heavy system font reads fine (no Anton dependency).
const mark = (bg) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${bg === "square" ? `<rect width="1024" height="1024" fill="${INK}"/>` : ""}
  ${bg === "rounded" ? `<rect width="1024" height="1024" rx="224" fill="${INK}"/>` : ""}
  <text x="512" y="722" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="690" letter-spacing="-12" fill="${WHITE}">S</text>
  <rect x="232" y="788" width="560" height="78" rx="39" fill="${ORANGE}"/>
</svg>`;

// Existing favicon, scaled up 1:1 for comparison.
const favicon = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0a0a0b"/>
  <text x="32" y="46" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="44" fill="#fafafa">S</text>
  <rect x="13" y="50" width="38" height="5" rx="2.5" fill="#ff6a00"/>
</svg>`;

// X header / banner, 1500x500. Wordmark centered (horizontally + vertically) so the avatar,
// which X drops over the bottom-left corner, never overlaps it. No tagline on the banner —
// it lives in the bio. Impact stands in for the brand display font (Anton) for sharp rendering.
const header = `
<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="500" viewBox="0 0 1500 500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#18181b"/>
      <stop offset="60%" stop-color="#0a0a0a"/>
    </linearGradient>
  </defs>
  <rect width="1500" height="500" fill="url(#bg)"/>
  <text x="750" y="285" text-anchor="middle" font-family="Impact, 'Arial Black', sans-serif" font-weight="900" font-size="190" letter-spacing="-5">
    <tspan fill="${WHITE}">Sweep</tspan><tspan fill="${ORANGE}">Szn</tspan>
  </text>
  <rect x="535" y="320" width="430" height="17" rx="8.5" fill="${ORANGE}"/>
</svg>`;

const jobs = [
  ["favicon-scaled-1024.png", favicon],
  ["avatar-square-1024.png", mark("square")],
  ["avatar-rounded-1024.png", mark("rounded")],
  ["mark-transparent-1024.png", mark("none")],
  ["x-header-1500x500.png", header],
];

for (const [name, svg] of jobs) {
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/${name}`);
  console.log("wrote", name);
}
