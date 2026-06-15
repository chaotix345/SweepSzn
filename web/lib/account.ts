"use client";
import type { ResultEntry } from "./resultHistory";

// Client helpers for the signed-in account's server-side state (profile / streak / results). All are
// best-effort: a signed-out user (401) or a network miss returns null/undefined and the app falls back
// to localStorage. The session cookie is httpOnly and sent automatically, so the caller never handles
// tokens — it only decides WHETHER to call (e.g. only when a SessionProvider user is present).

const HDR = { "content-type": "application/json", "x-requested-with": "fetch" } as const;

export interface AccountProfile { name: string; picture: string; streak: number; results: ResultEntry[] }

export async function fetchProfile(): Promise<AccountProfile | null> {
  try {
    const r = await fetch("/api/profile");
    if (!r.ok) return null;
    return (await r.json()) as AccountProfile;
  } catch { return null; }
}

// One-shot migration on sign-in (full local arrays) and ongoing single-entry pushes share this route.
export async function syncToAccount(payload: { history?: string[]; results?: ResultEntry[] }): Promise<{ streak: number; results: number } | null> {
  try {
    const r = await fetch("/api/profile/sync", { method: "POST", headers: HDR, body: JSON.stringify(payload) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export async function pushResult(entry: ResultEntry): Promise<void> {
  try { await fetch("/api/profile/sync", { method: "POST", headers: HDR, body: JSON.stringify({ results: [entry] }) }); }
  catch { /* best-effort — already in localStorage */ }
}

export async function updateName(name: string): Promise<string | null> {
  try {
    const r = await fetch("/api/profile/name", { method: "POST", headers: HDR, body: JSON.stringify({ name }) });
    if (!r.ok) return null;
    return ((await r.json()) as { name?: string }).name ?? null;
  } catch { return null; }
}
