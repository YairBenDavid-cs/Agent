# Coach Platform — Capstone Proposal

**One-liner:** A multi-agent AI training coach that turns wearable + calendar
data into a continuously safety-gated, adaptive weekly program.

**Built by:** Yair Ben David
**Repo (public):** https://github.com/YairBenDavid-cs/Agent
**Demo:** _recording in progress — will be added to this submission before
judging; see §10 Evidence Index for current status_
**Try it:**
```
cd coach-platform/api && npm install && cp .env.example .env
npm run start:dev   # requires MongoDB; see coach-platform/README.md for the
                     # fetch-service + frontend setup
```

---

## 1. The problem & who it's for

**First-user credibility — I built the coach I wanted.** I built this system
first and foremost for myself. I frequently found myself getting injured due
to overtraining and volume overload. At the same time, my progress stalled
because I didn't have a structured, data-driven plan — just guesswork between
workouts.

**The market gap.** A personal coach costs around 500 ILS (~$135 USD) a
month, and more often than not, they hand out a generic, cookie-cutter
training plan reused across multiple clients rather than something that
actually tracks how *your* body is responding day to day.

**The vision.** I wanted an AI coach that dynamically updates your training
plan based on your real-time physiological performance, continuously ensuring
goal progression while strictly enforcing safety bounds to prevent
overtraining and injury — personalization taken to the highest tier the data
actually supports, not a marketing label on a static template.

**The interface advantage.** It enables natural-language interaction with an
AI assistant that has full context of your physiological metrics — you can
consult it, review trends, and analyze statistics seamlessly, bypassing the
clunky, hard-to-read UIs of native apps like Garmin's. It's integrated with
Garmin today for data access, but the architecture is provider-agnostic by
design (see §4) — built to support any wearable.

**Who it's for:** committed amateur/intermediate endurance and strength
athletes training toward a concrete goal, who already wear a Garmin and live
by their calendar — people who'd otherwise pay for a human coach or wrestle
with a static plan from a generic app.

---

## 2. What it does & live demo flows

**Core execution modes** (deliberately modeled on Claude Code's mode
metaphor, since it's a legible mental model for "how much autonomy does the
agent have right now"):

- **Ask** — casual Q&A, trend analysis, and insight, without modifying the
  schedule.
- **Plan** — active execution for re-planning and generating schedules,
  strictly governed by Human-in-the-Loop (HITL) approval gates.
- **Auto** — full agentic autonomy: the agent can self-trigger, analyze, and
  safely execute modifications within defined bounds, without waiting for
  per-change approval.

**Target live/video demo flows:**

1. **Onboarding → program generation** — starting a new conversation in Plan
   mode, walking through the initial interview, and watching the system
   compile the weekly block into an interactive HITL approval card.
2. **Autonomous scheduled ingestion & safety gating** — the scheduled cron
   engine waking background tasks autonomously, syncing natively with Garmin,
   evaluating the user's health/recovery state, and dynamically triggering
   alerts or an automatic plan downgrade based on fatigue markers — before
   the user ever opens the app.
3. **Interactive weekly re-planning** — constructing a new week either
   completely automatically or through a contextual question-and-answer loop.

**The magic moment:** the athlete's HRV dips before a key session, and the
system has already downgraded it — a generic app or chatbot only reacts to a
question; this one reacts to the data.

*Note on state: screen recordings and screenshots are not yet captured; these
demo assets are being built fresh from the frontend (`frontend/src`) — see
§10 Evidence Index for status.*

---

## 3. The agentic core

### Agent topology & multi-agent collaboration

- **Agent-as-a-tool architecture.** The system distributes expertise across
  specialized agents, exposing downstream agents as functional tools to the
  primary orchestrator rather than folding everything into one prompt.
- **Shared state pipeline.** Multi-agent collaboration runs on a centralized,
  shared execution state (`agents/orchestrator/orchestrator.saga.ts` →
  `OrchestratorSaga`) that accompanies a request through every stage. The
  runtime evaluates context deterministically and routes to the specialist
  agent needed to fulfill the current step of a fixed catalog of 6
  pipelines — this is **deterministic state-machine code, not an LLM
  manager**. Single-writer discipline is enforced by design: Recovery is
  advisory-only and never edits a session; Coach owns content; Planner owns
  scheduling.
- **Scoped permissions by mode.** Which tools and write paths are reachable
  is strictly a function of the active mode: `assistant.decision.ts` flags
  every write/pipeline as `intentBlocked` in Ask mode (verified by
  `assistant.decision.spec.ts`'s "ask mode (read-only gate)" suite) so a
  read-only session structurally cannot mutate a schedule, no matter what the
  model outputs.
- **The execution loop.** Every agent runs the same bounded **Plan → Act →
  Observe** lifecycle:
  `agents/shared/llm/agentic-loop.runtime.ts` → `AgenticLoopRuntime.run()`.
  Pre-seeded context means the common case needs zero tool calls; a hard cap
  of 8 model turns (`maxIterations`) bounds autonomy; a validator-bounce
  mechanism feeds a failed Zod-schema tool call or thrown handler error back
  into the loop as a message so the model self-corrects within the iteration
  cap instead of crashing the run. The loop exits only when the model calls a
  tool explicitly marked `terminal: true`.

**Tools per agent.** A single shared read-tool registry
(`agents/shared/read-tools/read-tool-registry.service.ts`), defined and
tested once, granted to each agent by reference so there's no duplicated read
path, and every call is tenant-scoped by `ctx.userId` — never a
model-supplied argument:

| Agent | Tools |
|---|---|
| Coach | `query_planned_sessions`, `get_week`, `query_sessions`, `query_performance`, `get_preference_events`, `search_exercise_catalog`, `get_exercise_detail`, `query_adherence` (8) |
| Recovery | `query_recovery`, `query_sessions`, `query_performance` (3) |
| Planner | `query_planned_sessions`, `get_week`, `list_calendar_events`, `get_availability` (4) |
| Assistant | union of all of the above plus `query_cross_source` (12) |

**Autonomy.** A scheduled fetch trigger drives ingestion and, in Auto mode, a
self-committing re-plan without waiting for a human turn. Evidence:
`coach-platform/evals/harness/out/runs.jsonl` — 150 real, end-to-end runs
driven through the actual API + LLM against a live seeded user (50 ask / 50
plan / 50 auto), not a mocked simulation.

### Memory, personalization & the OpenClaw-style projection engine

The memory system is modeled directly on the OpenClaw pattern of
**"files-as-truth, rebuildable index"** — except here the durable log is
structured preference data instead of files, and the rebuildable index is a
Mongo projection instead of a search index. This is not just a design
inspiration I'm claiming after the fact: the ingestion idempotency helper's
own code comment (`common/util/content-hash.ts`) literally calls it *"the
OpenClaw delta-sync idea applied to structured data."*

- **The log.** `preference_events` is append-only. Each event
  (`personalization/domain/preference-event.model.ts`) carries a `source`
  (`chat` / `outcome` / `session_flush`), a `scope` (`global` / `session` /
  `exercise`), a `durability` (`standing` vs. `one_off`), and a structured
  `tag` with an explicit `TagConfidence` of `explicit` or `inferred` — the
  distinction between "the user said this outright" and "the system noticed
  a pattern" is a first-class field, not folded into free text. The tag
  vocabulary is versioned (`CURRENT_TAXONOMY_VERSION`, currently **v5**) with
  an inline version-history comment documenting every change — this is what
  let the `overreaching` safety-tag fix (§5) land as a clean, replay-safe
  v4→v5 bump instead of silent schema drift.
- **The projection.** `DistillationService.distill()` is a pure function
  that turns the raw log into a `user_preferences` projection, explicitly
  documented in code as: *"same events + same `now` always yield the same
  projection, so the store is fully rebuildable."* This is proven, not just
  claimed — `RebuildProjectionHandler` re-derives the entire projection from
  `findAllForReplay(userId)` and re-upserts it, exposed via a real rebuild
  endpoint. Delete the projection and it comes back byte-for-byte from the
  log.
- **Evidence-based promotion, not a flag flip.** `PromotionService.buildEntry`
  promotes an explicit + standing signal to a **hard** preference
  immediately, but an **inferred** signal needs repeated reinforcement
  (3 occurrences for a dislike, 2 for a like) within a 90-day decay window
  before it's promoted to a **soft** preference — and is marked `confirmed`
  if the user later states it explicitly. This is the actual mechanism
  behind "the profile gets more precisely tailored the longer someone uses
  it" (§8) — it's a real threshold-based state machine, not a metaphor.
- **A second guardrail layer, on memory itself.**
  `ProjectionValidatorService` re-checks 6 invariants after every
  distillation run — no inferred signal silently promoted to hard, no
  decayed entry left un-pruned, bias values in range, provenance present,
  support counts consistent, no duplicate entries — and repairs breaches
  before persistence.
- **The read path.** `prompt-flattener.ts` renders the projection into plain
  `[must]` / `[prefer]` / `(inferred)` prompt blocks that seed every agent's
  context, so personalization actually changes agent behavior rather than
  sitting unread in the database.
- **Cold start.** A brand-new user with no event history gets an explicit
  `detectColdStart` check (no program, 0 sessions, 0 performance rows) and a
  fallback onboarding-survey/wearable-baseline seed instead of an empty or
  hallucinated preference block.
- **Elicitation prompts (grill-me-style interview protocol).**
  `agents/shared/prompts/interview-protocol.prompt.ts` requires the Assistant
  to ground two things — via at most 5 one-at-a-time open questions, never
  guessing — before any preference is captured: **WHY** (the reason behind
  the request) and **LOCAL vs. GENERAL** (a one-off complaint vs. a standing
  rule going forward). It's the same interview discipline this proposal
  process is named after, applied to eliciting personalization signal
  instead of eliciting a project brief. A three-lane classifier enforces it:
  **black** (explicit order) applies the protocol and captures once
  grounded; **gray** (soft signal, e.g. "I don't like burpees") investigates
  via a read-tool, then asks exactly one grounded clarifying question rather
  than guessing, converting to an explicit preference only on user
  confirmation; anything too weak even for a question is logged as a
  low-confidence inferred hint instead of being discarded. Safety signals
  (`injury_or_illness`, `overreaching`) bypass this protocol entirely and
  fire immediately (§5) — the interview discipline is deliberately suspended
  exactly where waiting on five questions would be unsafe.
- **Content-hash idempotent ingestion.** `common/util/content-hash.ts`
  computes a SHA-256 over stable, sorted-key JSON, applied to daily
  recovery/session/performance snapshot ingestion. Re-polling Garmin for a
  day that hasn't changed writes nothing and costs no extra downstream token
  spend — the same delta-sync idea, applied one layer below the preference
  log, to the raw physiological snapshots that feed it.

---

## 4. Architecture

**Components & data flow.** Three deployable pieces: the API
(`coach-platform/api`, NestJS + MongoDB + CQRS, hosts the agent layer), the
fetch service (`coach-platform/fetch-service`, stateless Python/FastAPI —
owns no database, credentials in, metrics out), and the frontend
(`frontend`, React + Vite, the chat/approval-card surface over SSE). External
APIs: Garmin Connect (via the fetch service), Google Calendar (per-user OAuth),
OpenAI GPT-4o (all agents/classifiers).

**Robustness.**
- Pre-write calendar validator: `agents/planner/planner.prewrite-validator.ts`
  → `validatePlacement()` — rejects overlaps, hard blocked-window violations,
  bad tz→UTC conversions, and duration-doesn't-fit placements *before* any
  write, bouncing a precise reason back into the loop.
- Fail-safe saga: every stage in `OrchestratorSaga` writes tentative-only; if
  a stage produces no terminal result, `requireTerminal()` throws, the whole
  pipeline aborts, and nothing user-visible commits.
- Redis-backed idempotency (`agents/shared/queue/idempotency.store.ts`,
  SET-NX with TTL) plus a per-user single-flight serialization
  (`pipeline-queue.service.ts`) so a scheduled fetch and a simultaneous
  mid-chat edit for the same user never race.

**Tests.** `npm test` in `coach-platform/api`: **66/66 suites, 452/452 tests
pass.** (A pre-submission pass fixed one shared TypeScript type mismatch in a
test factory that had been blocking 12 suites from compiling —
`personalization/.../__tests__/preference-event.factory.ts:28` — and added one
new regression test for the overreaching safety-gate fix, §5.) Beyond unit
tests, the eval harness
(`coach-platform/evals/harness/`) is the stronger integration-level proof: 150
real runs judged by an LLM against Mongo ground truth, with a written bug
report (`out/BUG-REPORT.md`) — see §6.

---

## 5. Safety & control

**Human-in-the-loop.** Generated and revised weeks are never applied silently
— they arrive as per-session approval cards (approve / revise / reject), each
with its rationale and diff. The only immediate-fire exceptions are explicit
safety signals (`injury_or_illness`, `overreaching`), which force a re-plan
rather than waiting for a chat turn.

**Guardrails enforced in code (not just prompted):**
- `agents/coach/coach.guardrails.ts` → `validateWeek()`: caps weekly load
  increase at ≤10% week-over-week (skipped on deload weeks) and caps hard
  sessions by readiness band (red readiness → 0 hard sessions, amber → 1).
  `validateSkeleton()`: enforces a mandatory deload/taper at least every 4
  weeks.
- `planner.prewrite-validator.ts` (see §4) guards the one irreversible
  external write.
- `integrations/infrastructure/google/google-calendar.client.ts` →
  `assertOwned()`: the Planner may only edit/delete events tagged with its own
  `extendedProperties.private.appId` — it can read a user's full calendar for
  clash detection but can never touch or delete a personal event.

**Secrets & data.** Garmin credentials and Google refresh tokens are encrypted
at rest with AES-256-GCM (`common/crypto/crypto.service.ts`); the encryption
key is expected from a secrets manager, never the DB. Env vars are validated
at boot — the app refuses to start with missing/invalid secrets. `.env*` is
gitignored; only `.env.example` is committed.

**Known gaps, disclosed rather than hidden** (our own eval harness is what
surfaced both of these — that's the harness working as intended):
1. The ACWR ≤1.3 threshold is currently **prompt guidance only** — it is not
   yet a code-level check the way the 10% load cap is. Framed honestly here
   rather than overclaimed.
2. The eval harness caught a genuine hard-gate miss: a message like *"I might
   be overtrained, back everything off"* was not routed to the safety
   pipeline (`SAFETY_REPLAN`) because "overtraining" isn't in the safety-tag
   vocabulary yet — root cause is three files
   (`assistant.prompt.ts`, `assistant.contracts.ts`, `assistant.decision.ts`).
   **Fixed before submission**: added `overreaching` as a first-class safety
   tag (taxonomy v5) routed to `SAFETY_REPLAN` exactly like
   `injury_or_illness`, across the domain model, the tag-routing table, the
   assistant's decision logic, and the system prompt, with a regression test
   (`assistant.decision.spec.ts`) that replays the exact failing eval case.
   All 66 suites / 452 tests pass, including that new test. This is the
   harness doing its job: find a real gap, root-cause it, close it, prove it
   with a test — not just talk about safety.

**No unattended high-harm action lacks a cap.** Auto mode still runs through
the recovery gate and the pre-write validator before any write; the only
irreversible external side effect (a Google Calendar write) is least-privilege
and scoped to app-owned events only, never a user's personal calendar.

---

## 6. Engineering highlights & proudest achievements

1. **Strict operational modes & HITL integration.** A clean segregation
   between Ask, Plan, and Auto modes, sharing the same agent code but
   differing only in which write paths are gated — full agentic autonomy
   when safe, bulletproof Human-in-the-Loop gates whenever a schedule is
   actually modified.
2. **A state-of-the-art user memory engine.** The OpenClaw-style
   `preference_events` → `user_preferences` projection system (§3) — an
   append-only, confidence-scored, evidence-promoted, invariant-audited
   ledger that continuously feeds essential context into every agent
   runtime. This is the system's real long-term "learning" mechanism and the
   basis of the MOAT (§8).
3. **Production-grade integrations.** Secure, tokenized, encrypted live
   integrations with both Garmin Connect and Google Calendar, cross-
   referencing physiological reality with schedule reality — not mocked data
   sources.
4. **A rigorous evaluation harness that found real bugs.** The harness
   (`coach-platform/evals/harness/`) was iterated across roughly 200 real
   test cases in 50-run batches, each judged against a distinct LLM
   evaluation rubric to catch regressions, hallucinated events, or reasoning
   failures during development. The submitted evidence artifact is the
   latest full pass: **150 real, end-to-end runs** (50 ask / 50 plan / 50
   auto) against a live seeded user, LLM-judged against Mongo ground truth,
   root-causing two concrete failures
   (`coach-platform/evals/harness/out/BUG-REPORT.md`): the overtraining
   safety-routing gap (fixed, §5), and hallucinated numeric answers in
   roughly half of read-only "ask" responses (e.g. reporting VO2max 61 vs.
   ground truth 60, inventing a calendar event that doesn't exist). This is
   the single most convincing artifact in this submission — proof the system
   was tested against reality, not just built and demoed once.

---

## 7. Hardest problem solved — the domino effect of modifications

The single most complex problem was single-workout modifications. A change
to one isolated session doesn't happen in a vacuum — it immediately creates a
cascading domino effect that can break the week's locked volume target,
violate progressive-overload assumptions, or create a calendar conflict.

Engineering the agents to grasp these interconnected constraints, recognize
when a localized change violates a macroscopic rule, and cleanly resolve the
downstream conflict without breaking the entire program structure was a
significant reasoning and architectural hurdle. The fix was architectural,
not prompt-based: weekly targets are locked *before* any individual session
is drafted (`validateAgainstWeeklyTargets`), so a local edit
(`orchestrator.saga.ts` → `runSessionContentReplan` /
`runTargetRevisionReplan`) is bounded by a frozen macro budget instead of
being free to cascade. That turns a reasoning problem ("does this edit break
the week?") into a deterministic check the code enforces every time.

---

## 8. Business model & the competitive MOAT

**The MOAT — the Spotify-playlist effect.** Our primary moat is the
compounding personalization log (`preference_events`, §3). The longer a user
trains with the system, the more deeply refined their custom profile
becomes — precisely which exercises they dislike, their real scheduling
constraints, and how their body actually responds to load. Leaving the
platform means losing months of highly granular, learned training behavior
and physiological adaptation — a real switching cost, identical to losing a
years-old, hand-tuned Spotify playlist. That's not replicable by a competitor
on day one, even with the same underlying model.

**Business model.** A classic B2C freemium SaaS subscription:
- **Free tier:** limited daily message tokens and a capped number of workout
  adjustments per month.
- **Premium tier:** unlimited interaction, full Auto-mode autonomy tracking,
  and deep historical trend analysis.

**Next milestone that would prove it out:** a small cohort of real users
retained past one full training block (4+ weeks), showing the plan measurably
adapting to their actual data rather than repeating a template.

---

## 9. Built across the fellowship

- [x] **Agent harness (WS1)** — the bounded, cacheable agentic loop
  (`agentic-loop.runtime.ts`) plus the deterministic orchestrator saga.
- [ ] Skills & product packaging (WS2) — not the shape of this product; not
  claimed.
- [x] **MCP server / tools & security (WS3)** — the shared, tenant-scoped
  read-tool registry with per-agent scoped subsets and mode-based write
  permissions.
- [x] **Autonomous agent (WS4)** — scheduled cron ingestion, HITL gates,
  bounded iteration caps, and eval-harness observability
  (`runs.jsonl` / `BUG-REPORT.md`).
- [x] **Cross-agent / sub-agents (WS5)** — Coach / Recovery / Planner /
  Assistant orchestrated over shared state via an agent-as-tool pattern, with
  the Orchestrator as the deterministic dispatcher.

---

## 10. Evidence index

- **Runnable test:** `cd coach-platform/api && npm test` → 66/66 suites,
  452/452 tests passing as of submission. A fresh run's raw output is
  bundled here: `submissions/coach-platform/evidence/test-output.log`.
- **Strongest artifact (demonstrated tier):**
  `submissions/coach-platform/evidence/BUG-REPORT.md` +
  `submissions/coach-platform/evidence/runs.jsonl` (copied from
  `coach-platform/evals/harness/out/`) — 150 real runs against a live seeded
  user, LLM-judged against ground truth, with two root-caused bugs. This is
  a reproducible run, not a claim.
- **Repo:** https://github.com/YairBenDavid-cs/Agent — **public** as of
  submission. A zip export of the tracked source is also bundled in this
  folder (`submissions/coach-platform/repo-export.zip`) as a durable copy of
  the evidence independent of GitHub availability.
  Key files: `coach-platform/api/src/agents/`,
  `coach-platform/api/src/personalization/`,
  `coach-platform/api/src/common/util/content-hash.ts`,
  `coach-platform/api/src/agents/shared/prompts/interview-protocol.prompt.ts`.
- **Demo:** _[link/recording — fill in before submitting]_.
- **Screenshots/logs:** a curated handful from the approval-card flow —
  _[to attach]_.
