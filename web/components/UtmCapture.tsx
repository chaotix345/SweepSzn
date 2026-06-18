"use client";
import { useEffect } from "react";
import { captureUtm } from "@/lib/utm";

// Mounted once in the root layout so it runs on EVERY route (landing, /play, /r/, /pe/, …). Captures
// the first-touch ?utm_source= at the first landing and persists it, so when first_play fires later on
// /play — after the CTA has navigated to a clean URL that no longer carries utm — the play can still be
// attributed to the channel that brought the visitor. Renders nothing; analytics is best-effort.
export default function UtmCapture() {
  useEffect(() => {
    captureUtm();
  }, []);
  return null;
}
