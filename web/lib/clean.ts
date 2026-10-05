// Sanitize a user-supplied display name at the trust boundary: drop control, zero-width, and
// bidirectional-override characters (which can garble OG share cards or visually spoof other
// names), then trim and cap at 24 code points (never splitting a surrogate pair). Returns "" for
// non-strings; callers apply their own default ("Anonymous" / the session name).
// Covers C0 controls + DEL, the Arabic letter mark (U+061C), the Mongolian vowel separator
// (U+180E), zero-width/directional marks (U+200B-200F), LTR/RTL embedding & override
// (U+202A-202E), word joiner / invisible operators + directional isolates (U+2060-2069),
// BOM/ZWNBSP (U+FEFF), and the blank-rendering Hangul fillers (U+115F, U+1160, U+3164, U+FFA0).
// Built from code points (not literal glyphs) so the source stays plain ASCII.
const r = (a: number, b: number) => `\\u${a.toString(16).padStart(4, "0")}-\\u${b.toString(16).padStart(4, "0")}`;
const STRIP = new RegExp(
  `[${r(0x00, 0x1f)}\\u007f\\u061c\\u180e${r(0x200b, 0x200f)}${r(0x202a, 0x202e)}${r(0x2060, 0x2069)}\\ufeff${r(0x115f, 0x1160)}\\u3164\\uffa0]`,
  "g",
);

export function cleanName(s: unknown): string {
  return typeof s === "string" ? Array.from(s.replace(STRIP, "").trim()).slice(0, 24).join("") : "";
}
