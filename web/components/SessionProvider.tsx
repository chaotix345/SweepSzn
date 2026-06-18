"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import GoogleOneTap from "@/components/GoogleOneTap";
import { buildFocusTrapHandler } from "@/components/game/useFocusTrap";
import { getHistory } from "@/lib/streak";
import { listResults } from "@/lib/resultHistory";
import { syncToAccount } from "@/lib/account";
import { AUTH_ENABLED } from "@/lib/authClient";

// App-wide session state: one /api/auth/me fetch shared by the header, the leaderboard, every mode
// board, and the notification bell (instead of each calling it independently). Also hosts the single
// Google One Tap instance — mounting GSI once avoids the double-initialize conflicts you'd get from
// multiple prompts. The default context value is "signed out / no-op", so any component that calls
// useSessionContext() outside the provider (e.g. an isolated component test) renders safely.

export interface SessionUser { uid: string; name: string; picture?: string }

interface SessionCtx {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  promptSignIn: () => void;
  // Bumps once per FRESH sign-in (not on initial load of an already-signed-in session), so a component
  // can run a one-time on-sign-in action (e.g. the daily "claim my rank") without re-firing every mount.
  signInNonce: number;
}

const Ctx = createContext<SessionCtx>({
  user: null,
  loading: false,
  refresh: async () => {},
  signOut: async () => {},
  promptSignIn: () => {},
  signInNonce: 0,
});

export const useSessionContext = () => useContext(Ctx);

async function fetchMe(): Promise<SessionUser | null> {
  try { const r = await fetch("/api/auth/me"); const j = await r.json(); return j?.user ?? null; }
  catch { return null; }
}

export default function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInNonce, setSignInNonce] = useState(0);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Move focus into the sign-in popover when it opens (paired with the Tab/Escape trap below) so
  // keyboard users land in the dialog and can dismiss it. Restores nothing on close — the trigger
  // (header "Sign in" etc.) stays where it was.
  useEffect(() => { if (signInOpen) popoverRef.current?.focus(); }, [signInOpen]);

  useEffect(() => {
    let on = true;
    (async () => { const u = await fetchMe(); if (on) { setUser(u); setLoading(false); } })();
    return () => { on = false; };
  }, []);

  const refresh = useCallback(async () => { const u = await fetchMe(); setUser(u); setLoading(false); }, []);

  const signOut = useCallback(async () => {
    // only drop local state if the server actually cleared the cookie (avoid a split-brain UI)
    try { const r = await fetch("/api/auth/signout", { method: "POST", headers: { "x-requested-with": "fetch" } }); if (r.ok) setUser(null); }
    catch { /* leave state as-is */ }
  }, []);

  const promptSignIn = useCallback(() => setSignInOpen(true), []);

  // Fresh sign-in: refresh the session, migrate this device's local progress (completed-daily dates +
  // result history) up into the account, and bump the nonce so on-sign-in actions fire exactly once.
  const onSignedIn = useCallback(async () => {
    setSignInOpen(false);
    await refresh();
    await syncToAccount({ history: getHistory(), results: listResults() });
    setSignInNonce((n) => n + 1);
  }, [refresh]);

  return (
    <Ctx.Provider value={{ user, loading, refresh, signOut, promptSignIn, signInNonce }}>
      {children}
      {AUTH_ENABLED && !loading && !user && signInOpen && (
        // Google sign-in is deferred to user INTENT: GSI (the Google button) loads only when the player
        // opens sign-in — the header "Sign in", a leaderboard CTA, or the post-game "Save with Google"
        // nudge, all via promptSignIn(). There is no unsolicited One Tap prompt on the landing page:
        // anon play is the funnel; signing in is the opt-in upgrade for anyone who cares about their
        // standing (DESIGN.md §12). Gating the mount also keeps GSI's iframe/FedCM off the top of funnel.
        <>
          <div className="fixed inset-0 z-40 bg-black/40" aria-hidden="true" onClick={() => setSignInOpen(false)} />
          <div
            ref={popoverRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="signin-title"
            onKeyDown={(e) => buildFocusTrapHandler(popoverRef, () => setSignInOpen(false))(e)}
            className="fixed right-3 top-16 z-50 w-72 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/50 outline-none"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div id="signin-title" className="text-sm font-bold text-zinc-100">Save your progress</div>
              <button onClick={() => setSignInOpen(false)} aria-label="Close" className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:text-zinc-200">✕</button>
            </div>
            <div className="mb-2 text-xs text-zinc-400">Keep your streak, results, and ranks across every device.</div>
            <GoogleOneTap onSignIn={onSignedIn} />
          </div>
        </>
      )}
    </Ctx.Provider>
  );
}
