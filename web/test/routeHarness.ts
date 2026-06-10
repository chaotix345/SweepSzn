import { createRedisFake, type RedisFake } from "./redisFake";
import { SESSION_COOKIE, signSession, type SessionUser } from "@/lib/auth";

// Shared context for route integration tests. Route handlers are imported as plain functions
// with three module mocks declared per test file (factories live here so every file uses the
// same wiring):
//
//   vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
//   vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
//   vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));
//
// lib/redis.ts runs UNCHANGED: enableRedisEnv() must be called before the route module is
// dynamically imported (it reads env at module eval); the mocked Redis constructor then returns
// a stable proxy to ctx.redis, so freshFake() swaps state per test without re-importing.
// The ctx is anchored on globalThis: vi.resetModules()/factory re-evaluation can produce fresh
// copies of this module, and all of them must share one state.

type Ctx = {
  redis: RedisFake | null;
  cookies: Map<string, string>;
  after: Array<() => unknown>;
};

const g = globalThis as typeof globalThis & { __routeHarnessCtx?: Ctx };
export const ctx: Ctx = (g.__routeHarnessCtx ??= { redis: null, cookies: new Map(), after: [] });

export function enableRedisEnv(): RedisFake {
  process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";
  return freshFake();
}

export function disableRedisEnv(): void {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  ctx.redis = null;
}

export function freshFake(): RedisFake {
  ctx.redis = createRedisFake();
  ctx.cookies.clear();
  ctx.after.length = 0;
  return ctx.redis;
}

export function upstashRedisMockModule() {
  const proxy = new Proxy({} as Record<PropertyKey, unknown>, {
    get(_t, prop) {
      if (!ctx.redis) throw new Error("routeHarness: ctx.redis not set — call enableRedisEnv() first");
      return Reflect.get(ctx.redis, prop);
    },
  });
  return { Redis: class { constructor() { return proxy; } } };
}

export function nextHeadersMockModule() {
  const jar = {
    get: (name: string) => (ctx.cookies.has(name) ? { name, value: ctx.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => { ctx.cookies.set(name, value); return jar; },
    delete: (name: string) => { ctx.cookies.delete(name); return jar; },
  };
  return { cookies: async () => jar };
}

export function nextServerMockModule(original: object) {
  // after() requires a live request scope outside of `next start`; queue tasks instead and let
  // tests run them explicitly via flushAfter().
  return { ...original, after: (task: () => unknown) => { ctx.after.push(task); } };
}

export async function flushAfter(): Promise<void> {
  const tasks = ctx.after.splice(0);
  for (const t of tasks) await t();
}

export function authEnv(): void {
  process.env.AUTH_SECRET = "test-secret-0123456789abcdef-0123456789abcdef";
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
}

// Real signed session JWT in the cookie jar — authServer.getSession() runs unmodified.
export async function signIn(user: SessionUser): Promise<void> {
  authEnv();
  ctx.cookies.set(SESSION_COOKIE, await signSession(user));
}

export function req(
  url: string,
  init?: { method?: string; body?: unknown; rawBody?: string; headers?: Record<string, string>; ip?: string },
): Request {
  const headers = new Headers(init?.headers);
  if (init?.ip) headers.set("x-forwarded-for", init.ip);
  let body: string | undefined;
  if (init?.rawBody !== undefined) {
    body = init.rawBody;
  } else if (init?.body !== undefined) {
    body = JSON.stringify(init.body);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  const method = init?.method ?? (body !== undefined ? "POST" : "GET");
  return new Request(new URL(url, "http://sweepszn.test").toString(), { method, headers, body });
}

export async function readJson(res: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

// Pre-seed a fixed-window rate-limit bucket to its max so the NEXT call is the 429.
export function exhaustRateLimit(bucket: string, max: number): void {
  if (!ctx.redis) throw new Error("routeHarness: ctx.redis not set");
  ctx.redis.strings.set(bucket, String(max));
}
