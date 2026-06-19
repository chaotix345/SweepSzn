"use client";
import { useEffect } from "react";
import { captureUtm } from "@/lib/utm";
import { captureRef } from "@/lib/referral";

// Mounted once in the root layout so it runs on EVERY route (landing, /play, /r/, /pe/, …). Captures
// the first-touch ?utm_source= AND ?ref= (referral code) at the first landing and persists them, so
// when first_play fires later on /play — after the CTA has navigated to a clean URL that no longer
// carries the params — the play can still be attributed to the channel/friend that brought the
// visitor. Renders nothing; analytics is best-effort.
export default function UtmCapture() {
  useEffect(() => {
    captureUtm();
    captureRef();
  }, []);
  return null;
}
