"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionContext } from "@/components/SessionProvider";
import { updateName } from "@/lib/account";
import { AUTH_ENABLED } from "@/lib/authClient";

// Header account control: a "Sign in" button when signed out (opens the One Tap popover via the
// provider), or an avatar menu when signed in (edit the cross-device handle, sign out). Renders
// nothing when auth isn't configured, so the build/deploy is unaffected without a Google client id.
export default function AuthControl() {
  const { user, loading, signOut, promptSignIn, refresh } = useSessionContext();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const save = useCallback(async () => {
    const n = name.trim();
    if (!n) { setEditing(false); return; }
    setBusy(true);
    const updated = await updateName(n);
    if (updated) await refresh();
    setBusy(false); setEditing(false); setOpen(false);
  }, [name, refresh]);

  if (!AUTH_ENABLED || loading) return null; // wait for /api/auth/me — avoids a "Sign in" → avatar flash

  if (!user) {
    return (
      <button
        onClick={promptSignIn}
        aria-label="Sign in to sync your record across devices"
        className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-sm font-semibold text-orange-300 transition hover:border-orange-500/70 hover:bg-orange-500/20"
      >
        <span className="sm:hidden">Sync</span>
        <span className="hidden sm:inline">Sync your record</span>
      </button>
    );
  }

  const initial = (user.name || "?").charAt(0).toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen((o) => !o); setName(user.name); setEditing(false); }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-sm font-black text-black"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-zinc-800 bg-zinc-900 p-3 shadow-2xl shadow-black/50">
          <div className="mb-2 text-xs text-zinc-500">Signed in · synced across devices</div>
          {editing ? (
            <div className="flex gap-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={24}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
                aria-label="Display name"
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-orange-500"
              />
              <button onClick={save} disabled={busy} className="shrink-0 rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-bold text-black disabled:opacity-60">
                {busy ? "…" : "Save"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setEditing(true); setName(user.name); }}
              className="block w-full truncate text-left text-sm font-semibold text-zinc-100 hover:text-orange-300"
            >
              {user.name || "Set a handle"} <span className="text-xs font-normal text-zinc-500">· edit</span>
            </button>
          )}
          <button
            onClick={() => { setOpen(false); void signOut(); }}
            className="mt-3 block w-full rounded-lg border border-zinc-800 py-1.5 text-xs font-semibold text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
