import "server-only";
import { sha256hex } from "./auth";

// A referral code is an opaque PUBLIC proxy for a user — derived from the uid but never the uid
// itself (DESIGN.md §12: the anon bearer-token uid must not appear in URLs/logs). Deterministic so
// minting is idempotent; the server stores only the reverse map (ref:code:<code> → uid) because the
// hash can't be inverted. Shape mirrored client-side by REF_RE in lib/referral.ts.
export const REF_RE = /^r[0-9a-f]{11}$/;

export function refCodeFor(uid: string): string {
  return "r" + sha256hex("ref:" + uid).slice(0, 11);
}
