// Sanitize a user-supplied display name at the trust boundary: drop control, zero-width, and
// bidirectional-override characters (which can garble OG share cards or visually spoof other
// names), then trim and cap at 24 chars. Returns "" for non-strings; callers apply their own
// default ("Anonymous" / the session name).
// Covers C0 controls + DEL, zero-width/directional marks (U+200B-200F), LTR/RTL embedding &
// override (U+202A-202E), directional isolates (U+2066-2069), and BOM/ZWNBSP (U+FEFF).
// Built from code points (not literal glyphs) so the source stays plain ASCII.
const r = (a: number, b: number) => `\\u${a.toString(16).padStart(4, "0")}-\\u${b.toString(16).padStart(4, "0")}`;
const STRIP = new RegExp(
  `[${r(0x00, 0x1f)}\\u007f${r(0x200b, 0x200f)}${r(0x202a, 0x202e)}${r(0x2066, 0x2069)}\\ufeff]`,
  "g",
);

export function cleanName(s: unknown): string {
  return typeof s === "string" ? s.replace(STRIP, "").trim().slice(0, 24) : "";
}
