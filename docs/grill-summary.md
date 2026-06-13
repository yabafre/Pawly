---
generated_by: aped-grill
generated_at: 2026-06-03
question_count: 8
decided_count: 8
deferred_count: 5
out_of_scope_count: 3
stop_reason: no-new-question
---

# Grill summary — Pawly customer-acquisition system (design-partner outbound)

> Cold-start grill: no prior PRD/arch/CONTEXT loaded for the *acquisition* scope. Grounding came
> from a live 8-epic code audit (2026-06-03) of the Pawly product itself.

## Decided

- **Q1 — Run design-partner recruitment NOW; ship public deploy + live Stripe in parallel, not as a blocker.** The product is demoable today, so outreach does not wait on go-live.
- **Q2 — Target hyper-local first (France), not national.** Small reachable pool; in-person/white-glove feasible; no SIRENE sourcing script needed yet.
- **Q3 — Email is the primary channel; no cold in-person.** In-person demo offered ONLY to Île-de-France clinics that request it after the email.
- **Q4 — Demo asset is a produced Remotion video** (not a raw Loom screen-capture).
- **Q5 — Structured design-partner deal.** Free ~3-month pilot in exchange for: (a) a 20-min feedback call every 2 weeks, (b) a named testimonial + reference rights once value is seen, (c) optional logo / case study. Cap: 3-5 concurrent pilots. PLUS a **20% discount on the Pro plan for the first 6 months** after definitive subscription.
- **Q6 — Semi-automated outreach.** A free or custom-coded "Lemlist-style" sequencer on top of email; Claude sources the clinics and writes each personalized email per clinic; Alex pilots/approves. (Manual-only rejected — no time.)
- **Q7 — Isolate cold sending on ONE dedicated "cousin" domain (~10-15€/yr).** `pawly.fr` + Resend stay 100% transactional and untouched. A subdomain was rejected: it only *partially* isolates reputation (root-domain bleed). Multiple domains deferred to the national phase.
- **Q8 — White-glove onboarding.** Alex loads each pilot's real data (team, contracts, constraints, apprentices) himself for the first 3-5; the self-service wizard is polished later from what white-glove teaches.

## Deferred (still need a real-world answer)

- **Solo-founder sequencing / capacity** (Q-next) — order of operations across the next ~2 weeks: close the Story 1.5 register-gap, reach a pilot-ready private build, ship the Remotion video, source list, draft emails, white-glove onboard — all while product epics sit at 75-95%. Recommended next: start sourcing + first emails now; reach pilot-ready in parallel (the B2B sales cycle buys the buffer before any "yes" needs onboarding).
- **Division of labor Claude vs Alex** — who builds the sequencer, who supplies the dedicated domain + sending credentials, who approves list/copy. Recommended: Claude sources + drafts + scaffolds; Alex provides domain + approves + runs calls + white-glove.
- **Phase-exit trigger** — the concrete metric that graduates design-partner mode → national cold-sell (e.g., 3 pilots live + 2 converted + 2 testimonials). Recommended next: define before launch so the deferred national infra has an activation signal.
- **RGPD operational checklist** — BRAINST as data controller, registre des traitements, opt-out/STOP wired into the sequencer, pro addresses only. Recommended next: lock before the first send.
- **Concrete artifacts to pin** — the exact dedicated domain string; the Remotion video narrative/scope (60-90s single arc: Excel pain → one-click generation → HealthBar → team notified); the tracking surface (simple sheet vs Notion CRM).

## Out of scope (pinned for later)

- **National cold-sell infrastructure** — SIRENE / API Annuaire-Entreprises sourcing script, multi-domain rotation, Lemlist/Instantly + dedicated-domain warm-up. All belong to the post-deploy national phase, gated on the Q-next phase-exit trigger.
- **The other three SaaS** — Pekulo (B2C, inbound only), CloudVault, MoodStory. Pawly is the sole outbound focus.
- **Public marketing deploy + live Stripe as a *prerequisite*** — they are parallel, not gating. Pilots are free, so live Stripe is only needed at the first conversion (~month 3).

## Assumptions in play

- **Product readiness (verified against real code, 8-epic audit 2026-06-03):** Pawly is a demoable, near-feature-complete MVP — Epic 6 (planning engine) ~95%, Epic 2 (i18n) 100%, Epics 1/4/5 at 85-92%, Epics 3/7/8 at 75%. BUT it is **local-only** (`WEB_APP_URL=http://localhost:3020`), Stripe runs on **test keys**, and the `register` endpoint is still open (Story 1.5 gap). → grounds the "demo by video/visio, deploy in parallel" stance and the white-glove decision.
- **Stripe coupon infra already exists** (`promotionCodeId` / `couponId` / `discountType` fields on the Subscription model, Epic 3.5) → the 20% / 6-month discount is a config, not a build.
- **Resend is Pawly's transactional backbone** (magic links, Stripe receipts, schedule-publish emails) → must never be touched by cold outreach. → drives the domain-isolation decision (Q7).
- **Alex operates in/near Île-de-France** → basis for the IDF in-person exception (Q3).

## Suggested next skill

- `aped-prd` — to spec the custom "Pawly Acquisition System" (the Lemlist-style sequencer: list model, personalization tokens, scheduling, opt-out/STOP, reply detection, isolated-domain sending) as a lightweight PRD before building it story-driven. The non-code groundwork (IDF clinic sourcing, personalized email drafting, Remotion narrative) can proceed directly with Claude in parallel.
