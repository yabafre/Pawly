# Lessons Log

_Append-only. Each entry captures a durable rule, the mistake that motivated it, and the scope where it applies. Seeded on 2026-06-03 from the Epic 3 retrospective (`retros/epic-3-retro-2026-02-09.md`) during the BMAD→APED migration._

## L1 — Never mix Zsa tuple returns with TanStack Query direct returns

- **Rule:** Server Actions wrapped by Zsa return a `[data, error]` tuple; TanStack Query's `mutateAsync()` returns data directly. Pick the right destructuring per call site and audit every hook for the mismatch.
- **Mistake:** `useBilling.ts` destructured `const [result, err] = await portalMutation.mutateAsync(...)`, producing a runtime `TypeError: (intermediate value) is not iterable` that TypeScript could not catch (Epic 3, Bug #2).
- **Scope:** All `apps/web` hooks bridging Zsa server actions and React Query.

## L2 — Unit/integration tests do not replace real user-journey testing

- **Rule:** Add E2E or scripted manual coverage for critical end-to-end flows (checkout → activation → login → onboarding → billing) before declaring an epic production-ready.
- **Mistake:** 428 passing tests still let three CRITICAL runtime bugs reach manual testing, including an onboarding deadlock (`subscribedProcedure` on `completeOnboarding`).
- **Scope:** QA gate for every epic that touches a multi-step user flow.

## L3 — Reviews must cross-reference the PRD and architecture, not just the code

- **Rule:** During code review, verify the implementation against the documented design (auth strategy, FR/NFR), not only code-level correctness.
- **Mistake:** Six adversarial reviews caught ~45 code issues but missed that admin registration used the employee Magic Link path instead of the password flow mandated by the architecture and PRD NFR7 (Epic 3, Bug #1, an architecture deviation).
- **Scope:** Review process for all stories implementing an architecture-specified contract.

## L4 — Consult up-to-date docs (MCP Context7 / Stripe plugin) systematically

- **Rule:** Reference Context7 and relevant skills/plugins for every story; record the sources consulted in the story's Dev Notes.
- **Mistake:** Coding "from memory" surfaced outdated SDK patterns — Stripe SDK v20 breaking changes (`current_period_end`, `Invoice.subscription`, `subscription.discounts[]`) hit three stories.
- **Scope:** Implementation phase, all stories using third-party SDKs.
