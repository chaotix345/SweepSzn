"use client";
import { useCallback, useEffect, useRef } from "react";
import { getUid } from "@/lib/streak";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

declare global {
  // GIS global; typed loosely on purpose (no official types installed).
  interface Window { google?: { accounts: { id: {
    initialize: (cfg: Record<string, unknown>) => void;
    prompt: () => void;
    renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
  } } } }
}

let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { gisPromise = null; reject(new Error("gis load failed")); }; // allow retry on a later mount
    document.head.appendChild(s);
  });
  return gisPromise;
}

export default function GoogleOneTap({ onSignIn }: { onSignIn: () => void }) {
  const btnRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  // keep onSignIn in a ref so handleCredential + the init effect stay stable across parent re-renders
  const onSignInRef = useRef(onSignIn);
  useEffect(() => { onSignInRef.current = onSignIn; });

  const handleCredential = useCallback(async (resp: { credential?: string }) => {
    if (!resp?.credential || busyRef.current) return;
    busyRef.current = true;
    try {
      const r = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "content-type": "application/json", "x-requested-with": "fetch" },
        body: JSON.stringify({ credential: resp.credential, anonUid: getUid() }),
      });
      if (r.ok) onSignInRef.current();
    } catch { /* ignore */ }
    finally { busyRef.current = false; }
  }, []);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    (async () => {
      let nonce = "";
      try { const r = await fetch("/api/auth/nonce"); if (r.ok) nonce = (await r.json()).nonce; } catch { /* ignore */ }
      if (cancelled || !nonce) return;
      try { await loadGis(); } catch { return; }
      if (cancelled || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleCredential,
        nonce,
        use_fedcm_for_prompt: true,
      });
      window.google.accounts.id.prompt(); // inline One Tap
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: "filled_black", size: "large", text: "signin_with", shape: "pill",
        }); // fallback button (Safari / One Tap suppression)
      }
    })();
    return () => { cancelled = true; };
  }, [handleCredential]);

  if (!CLIENT_ID) return null;
  return <div ref={btnRef} className="flex justify-center" />;
}
