// Structured, grep-able logs. console.* is the only sink a solo Vercel deploy reliably has; a
// stable JSON shape makes errors searchable in the dashboard / a log drain (match on t + scope)
// instead of being one-off prose strings. Logging must never throw or carry secrets — callers
// must not pass uids (anon uids are bearer tokens) or tokens in ctx.
export function logError(scope: string, err: unknown, ctx?: Record<string, unknown>): void {
  try {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ t: "err", scope, msg, ...ctx }));
  } catch { /* logging must never throw */ }
}

// Counter-style events worth watching for bursts (e.g. rate-limit fail-open during a Redis
// outage — previously invisible, so sustained abuse during an outage left no trace).
export function logEvent(scope: string, ctx?: Record<string, unknown>): void {
  try { console.warn(JSON.stringify({ t: "event", scope, ...ctx })); } catch { /* ditto */ }
}
