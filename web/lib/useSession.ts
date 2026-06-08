"use client";
import { useCallback, useEffect, useState } from "react";

export interface SessionUser { uid: string; name: string; picture?: string }

async function fetchUser(): Promise<SessionUser | null> {
  try { const r = await fetch("/api/auth/me"); const j = await r.json(); return j?.user ?? null; }
  catch { return null; }
}

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => { const u = await fetchUser(); if (on) { setUser(u); setLoading(false); } })();
    return () => { on = false; };
  }, []);

  const refresh = useCallback(async () => { const u = await fetchUser(); setUser(u); setLoading(false); }, []);

  const signOut = useCallback(async () => {
    // only drop local state if the server actually cleared the cookie (avoid a split-brain UI)
    try { const r = await fetch("/api/auth/signout", { method: "POST" }); if (r.ok) setUser(null); }
    catch { /* ignore — leave state as-is */ }
  }, []);

  return { user, loading, refresh, signOut };
}
