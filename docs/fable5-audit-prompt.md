ultracode

# Full Autonomous Codebase Audit & Remediation

You are Fable 5 running with full autonomy. Your mission: take this codebase from its current state to drastically better — audited end to end, every significant problem found, and every confirmed problem fixed, tested, and merged. Work until done, not until convenient. Do not present a plan for approval, do not ask me questions mid-task — execute.

## Authority (overrides global defaults for this entire session)
- You ARE authorized to create branches, commit, push, and open PRs without asking, for this whole session. This explicitly overrides the "don't commit/push unless asked" rule.
- You ARE authorized to merge your own PRs once CI is fully green. (If I want to review instead, I'll have changed this line to: "Leave all PRs open for my review.")
- Never commit to main directly. Every wave of work is its own feature branch + PR.
- If the repo has no remote or no CI, work on local feature branches and merge locally only after full verification passes.
- If a decision is genuinely ambiguous, pick the conservative option, record it in the audit doc, and continue.
- Hard stops — the only things you may NOT do autonomously: destructive data operations (prod DB migrations that drop or rewrite data, deleting stored user data), changing billing/pricing behavior, rotating or committing secrets, deleting deployed infrastructure, force-pushing over shared history. If a fix requires one of these, document it as a flagged item instead and move on.

## Phase 0 — Baseline (before any changes)
1. Read the README, CLAUDE.md, package manifests, and CI config. Identify the language(s), framework, package manager, and exactly how to install, build, lint, typecheck, and test.
2. Run install, build, lint, typecheck, and the test suite. Record exact results (pass/fail counts, errors) as the baseline.
3. Capture metrics: source file count and LOC, test count and coverage if measurable, lint/type error counts, the largest files, dependency count, and outdated/vulnerable dependencies (`npm audit` or the ecosystem equivalent).
4. If the project cannot build or run at all, fixing that is Wave 1 — nothing else matters until there's a green-enough baseline to verify changes against.

## Phase 1 — Exhaustive audit (multi-agent)
Use parallel subagent workflows. Sweep every dimension below, and have each finding adversarially verified by an independent agent before accepting it — a finding must cite file:line evidence, and verifiers should actively try to refute it:
- Correctness: real bugs, broken edge cases, race conditions, error handling that swallows failures, unreachable branches hiding bugs
- Security: injection, authn/authz gaps, secrets in code or git history, unsafe input handling, dependency CVEs, exposed endpoints, OWASP Top 10
- Architecture: god files/components, circular dependencies, duplicated logic, wrong abstractions, dead code, unused exports and dependencies
- Performance: N+1 queries, unnecessary re-renders, unbounded memory growth, missing indexes or caching, bundle-size offenders
- Testing: coverage gaps on critical paths, missing test infrastructure, flaky patterns, untested error paths
- Data integrity: schema issues, missing validation at trust boundaries, inconsistent state handling
- DX/tooling: missing or broken lint/typecheck/CI, slow builds, missing scripts, docs that lie about the code
Keep auditing until two consecutive sweep rounds surface nothing new and significant (loop until dry). Do not cap findings at a round number.

## Phase 2 — Roadmap
Write `docs/audit-<date>.md` containing: the baseline metrics, every confirmed finding with severity (critical/high/medium/low), file:line evidence, and the planned fix. Group findings into execution waves of related work, ordered by:
1. Anything blocking verification (build, test infra, CI)
2. Critical bugs and security issues
3. High-impact architecture and performance fixes
4. Test coverage on critical paths
5. Cleanup, dead code, and DX
Commit this doc in the first PR and keep it updated as the source of truth.

## Phase 3 — Execute, wave by wave
For every wave:
1. `git checkout main && git pull`, then a fresh branch (`fix/...`, `refactor/...`, `test/...`, `chore/...`).
2. Implement the fixes. Preserve observable behavior unless the behavior IS the bug; if intended behavior is ambiguous, preserve current behavior and note it in the audit doc.
3. Write or update tests proving each fix. Refactors keep tests green; bug fixes get a regression test that fails before and passes after.
4. Run full verification (lint, typecheck, tests, build). Everything green — including pre-existing failures; fix those too.
5. Commit with conventional messages, push, open a PR whose description ties each change to audit findings. Merge when CI is green, then start the next wave from updated main.
- Keep each PR focused and reviewable: one wave of related changes, not a 10,000-line mega-PR and not fifty one-line PRs.
- If test or CI infrastructure is missing, building it is its own early wave: pick the idiomatic stack for the project, wire it into CI, and backfill tests for critical paths first.
- Dependency updates: prefer patch/minor bumps. Major version bumps only when required for a security fix, with full verification.
- If merging to main triggers a production deploy, smoke-check the deployment after each merge before starting the next wave.

## Phase 4 — Final verification & report
1. Re-run the full Phase 0 measurement and diff it against the baseline.
2. Run a final adversarial review pass with fresh agents over everything that changed, hunting specifically for regressions you introduced. Fix anything found.
3. Update the audit doc with the final status of every finding: fixed (PR #), flagged (needs a human, with why), or rejected (false positive, with reason).
4. End with a summary I can read in two minutes: before/after metrics, PRs merged, the most important fixes, and the flagged items that need me.

## Quality bar
- Evidence over plausibility: never "fix" something you haven't confirmed is broken by reading the actual code, and reproducing it where possible.
- No drive-by rewrites: fix what the audit found; don't restyle code you weren't changing.
- Match the project's existing conventions, naming, and idioms.
- Decompose big risky changes into safe incremental steps with tests at each step.
- If you hit a blocker (missing env vars, credentials, an external service), work around it where safe; otherwise document it in the audit doc and continue — never silently skip work.

Begin now with Phase 0.
