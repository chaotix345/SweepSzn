"use client";
import { useEffect, useRef } from "react";
import { ev, type EvName } from "@/lib/ev";
import { once } from "@/lib/once";
import { getUid } from "@/lib/streak";

// Invisible mount-time funnel beacon. Mounted on a server-rendered page (home, /r/, /pe/) it emits one
// `ev(name)` on the client. With `dedupe` it fires once per session/device (e.g. `visit`); without it,
// once per page view (e.g. `share_view` — each loop entry counts). The ref guard bounds re-renders to
// a single emit. Analytics is fire-and-forget and never throws into the UI.
export default function Beacon({
  name,
  dedupe,
}: {
  name: EvName;
  dedupe?: { scope: "session" | "device"; key: string };
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (!dedupe || once(dedupe.scope, dedupe.key)) ev(name, { uid: getUid() });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- emit exactly once on mount
  }, []);
  return null;
}
