<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Brand / visual decisions

Read `web/DESIGN.md` (the SweepSzn "Arena" design system) before changing any UI — colors, type,
the wordmark, or grade colors. The root `DESIGN.md` is a different doc (engine/game design).

# Conventions that override older docs

- `docs/superpowers/` is **historical** (frozen decision records) — never copy conventions from it.
- Tests are **Vitest** via `npm test` (hermetic: `test/redisFake.ts` + `test/routeHarness.ts`; no
  secrets needed). Never write standalone `npx tsx` test scripts.
- Every new API route needs a matching test in `test/routes/`.
- Env vars: `web/.env.example` is the canonical reference; features self-disable when vars are absent.
- Trust model + frozen 82-0 parity: root `DESIGN.md` §12 — read it before adding a game mode.
