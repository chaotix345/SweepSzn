"use client";
import { useEffect, useRef } from "react";
import { ev, type EvName } from "@/lib/ev";
import { once } from "@/lib/once";
import { getUid } from "@/lib/streak";
import { currentUtmSource, getUtmSource } from "@/lib/utm";

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
    if (!dedupe || once(dedupe.scope, dedupe.key)) {
      // Attribute the beacon to its acquisition channel: the source in THIS page's URL (robust against
      // the layout UtmCapture effect not having run yet), falling back to the persisted first-touch
      // source. Only visit is split by source server-side (bump ignores it for share_view).
      const source = currentUtmSource() ?? getUtmSource() ?? undefined;
      ev(name, source ? { uid: getUid(), source } : { uid: getUid() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- emit exactly once on mount
  }, []);
  return null;
}
