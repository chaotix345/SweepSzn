"use client";
import { useCallback, useEffect, useState } from "react";
import { getUid } from "./streak";

// NEXT_PUBLIC_ vars are inlined at build time: when VAPID isn't configured this is undefined, so the
// whole push opt-in self-disables (renders nothing) until the env is set AND the app is redeployed.
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function pushSupported(): boolean {
  return typeof window !== "undefined" && !!PUBLIC_KEY &&
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function isStandalone(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

// Convert the URL-safe base64 VAPID public key to the Uint8Array the PushManager expects. Backed by a
// concrete ArrayBuffer (not ArrayBufferLike) so it satisfies the strict BufferSource typing.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushState = "unsupported" | "ios-needs-install" | "default" | "granted" | "denied" | "busy";

export function usePush() {
  const [state, setState] = useState<PushState>("unsupported");

  useEffect(() => {
    let on = true;
    const detect = (): PushState => {
      if (pushSupported()) {
        return Notification.permission === "granted" ? "granted" : Notification.permission === "denied" ? "denied" : "default";
      }
      // iOS Safari supports web push only for a PWA installed to the Home Screen — surface that path
      // instead of a button that would silently fail. Otherwise the platform just can't do push.
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
      const isIos = /iphone|ipad|ipod/i.test(ua);
      return PUBLIC_KEY && isIos && !isStandalone() ? "ios-needs-install" : "unsupported";
    };
    // Defer off the synchronous effect path (react-hooks/set-state-in-effect) — capability detection
    // reads the browser once on mount; a microtask is plenty.
    Promise.resolve().then(() => { if (on) setState(detect()); });
    return () => { on = false; };
  }, []);

  const subscribe = useCallback(async () => {
    if (!pushSupported()) return;
    setState("busy");
    try {
      await navigator.serviceWorker.register("/sw.js");
      const perm = await Notification.requestPermission(); // only ever called on an explicit click
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "default"); return; }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY!),
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uid: getUid(), subscription: sub.toJSON() }),
      });
      setState("granted");
    } catch {
      setState(Notification.permission === "denied" ? "denied" : "default");
    }
  }, []);

  return { state, subscribe };
}
