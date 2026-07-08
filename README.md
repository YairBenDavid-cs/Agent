# Coach Platform — Multi-Agent AI Training Coach

A personalized, adaptive fitness-coaching platform that turns raw wearable data and a
stated goal into a living, week-by-week training program — generated, gated for safety,
scheduled against your real calendar, explained, and continuously revised by a team of
cooperating LLM agents sitting on top of a NestJS + MongoDB (DDD/CQRS) backend.

---

## What it does

Most training apps hand you a static plan. This platform behaves like an actual coach
who watches your data every day and adjusts.

A user states a goal (e.g. "sub-50-minute 10K in 12 weeks") and connects their wearable
(Garmin) and Google Calendar. From there the system:

1. **Ingests reality** — pulls executed workouts, recovery signals (HRV, sleep, resting
   HR, training readiness, body battery, ACWR), and performance trends (VO₂max, lactate
   threshold, race predictions, 1RMs) from the wearable.
2. **Generates a periodized program** — a ~12-week base→build→peak→deload/taper skeleton,
   then turns the *current* week into concrete prescribed sessions (rolling-horizon: only
   the imminent week is committed; future weeks stay tentative so they can react to how
   you actually respond).
3. **Gates every session-day for safety** — a recovery agent reads your physiological
   state and issues a readiness verdict (green/amber/red) that can force the plan to
   reduce volume, reduce intensity, shorten, swap to active recovery, or rest — before you
   ever get hurt.
4. **Schedules into your real life** — a planner agent reads your actual Google Calendar
   busy/free, finds slots that respect your availability and blocked windows, and (only
   after you approve) writes the training events back to Google Calendar.
5. **Explains itself and takes feedback in plain language** — a chat assistant answers
   "what's my HRV trend?", "why did you swap squats?", "am I recovered enough today?" and
   captures changes ("drop my long run to 25 km", "I hate burpees", "my back hurts") that
   re-plan the week.
6. **Keeps a human in the loop** — nothing irreversible happens silently. Generated and
   revised weeks arrive as per-session approval cards the user approves or revises.

What the user gets: a coach that is *theirs* — it adapts to their goal, their body's daily
readiness, their schedule, and their stated and inferred preferences, and it can justify
every decision it makes.

---

## Architecture

The system is three deployable pieces plus a multi-agent reasoning layer.

### High-level pieces

| Piece | Stack | Responsibility |
|-------|-------|----------------|
| **API / backend** (`coach-platform/api`) | NestJS 10, MongoDB (Mongoose), CQRS, Redis (hand-rolled idempotency store + pipeline queue) | Sole owner of all domain data and writes; hosts the agent layer and orchestrator. |
| **Fetch service** (`coach-platform/fetch-service`) | Python, FastAPI, `garminconnect` | Stateless Garmin authenticator + metric extractor. Owns **no** database — credentials/session in, normalized metrics out. |
| **Frontend** (`frontend`) | React 18 + Vite + TypeScript, React Router | Onboarding, auth, program view, and the live chat/assistant surface that streams the agentic workflow (SSE). |

### Domain backbone (DDD / CQRS)

The backend is organized by business feature, each module owning exactly one slice of data
through CQRS commands/queries/events: `training`, `program`, `planned-sessions`,
`sessions`, `performance`, `recovery`, `exercises`, `personalization`, `ingestion`,
`integrations`, `program-matching`, `users`, `auth`. Mongo collections include `users`,
`programs`, `planned_sessions`, `sessions`, `recovery_daily`, `performance_daily`,
`performance_profile`, `preference_events`, `user_preferences`, `health_constraints`, and
`user_integrations`.

**Personalization memory** is a single structured source of truth: an append-only
`preference_events` log distilled into a rebuildable `user_preferences` projection. That
projection plus domain facts feed context builders (`GenerationContext`, `RecoveryContext`,
`SchedulingContext`) that seed the agents. There is no second markdown/file store — the
append-only log + deterministic replay gives the "files-as-truth, rebuildable index"
property without dual-write drift.

### The agent layer (`coach-platform/api/src/agents`)

A thin reasoning tier on top of the domain modules. **Agents never touch repositories
directly** — all writes go through the existing CQRS commands, so domain modules keep
write ownership and all guardrails stay centralized.

**Five participants:**

- **Coach** — generates the periodized program skeleton (`generateProgram`) and the
  concrete weekly sessions (`generateWeek`). Owns content, volume, intensity, exercise
  selection, and session duration. Writes `tentative` sessions plus a `coachNotes`
  rationale; approval flips them to `committed`.
- **Recovery Guru** — *advisory only*; reads physiological data and emits a structured
  readiness verdict (`{readiness, drivers, recommendation, params, rationale}`) from a
  closed action enum. Never edits sessions (single-writer discipline).
- **Planner** — owns the calendar. Reads real Google events for clash detection, places
  sessions into time slots respecting availability and blocked windows, and writes/edits
  **only the training events it created** (tagged via Google `extendedProperties.private`).
  `planned_sessions` is the source of truth; the Google event is an idempotent downstream
  projection.
- **Orchestrator** — *deterministic* code (a saga / state machine), **not** an LLM
  manager. It owns a fixed catalog of pipelines and runs the minimal sufficient one per
  trigger, inheriting CQRS-style retries, idempotency, observability, and replay.
- **Chat Assistant** — the only free-form router. A per-turn classifier sorts each message
  into *white* (query → answer with read-tools or delegate to a specialist for a verdict),
  *black* (explicit order → write a `preference_event` and fire a pipeline if it touches
  the current week), or *gray* (soft signal → investigate and ask one grounded clarifying
  question).

**Shared agent infrastructure** (`agents/shared`): an OpenAI client, a bounded
tool-using agentic-loop runtime (capped iterations, pre-seeded context so the common case
needs zero tool calls), a **shared read-tool registry** (defined/tested once, granted by
reference — assistant gets the union, specialists get scoped subsets), Zod-backed
structured output, a hand-rolled Redis-backed pipeline queue (per-user single-flight
serialization, not BullMQ — BullMQ is a listed dependency but unused), a Redis
idempotency store, and seed/cold-start context builders.

**Pipeline catalog** (orchestrator picks deterministically via a tag-routing table):

1. **Full session-day (fetch)** — `Coach(assess) → Recovery(gate) → Coach(revise) →
   Planner(place) → [conflict loop] → approval → commit+sync`. The only pipeline that
   always runs the recovery gate.
2. **Safety re-plan** — recovery-driven (injury/illness, low readiness).
3. **Content re-plan** — coach-driven (remove exercise, drop km, too hard).
4. **Timing-only re-place** — planner-only (move to 7am), no coach.
5. **Program generation** — skeleton + first week (program start / major goal change).
6. **Write-only** — append `preference_event` + rebuild projection, no agents.

**Triggers** that drive change: scheduled `fetch` (session-day), `outcome`
(human-in-the-loop on any negative/missed session), `assistant` (mid-chat), `revision`
(batched weekly cards), and `session_flush` (durable-memory extraction at conversation
teardown).

### Data flow (session-day, the heaviest path)

```
Garmin ──(fetch-service)──► ingestion ──► recovery_daily / sessions / performance
                                              │
scheduler ─ fetch trigger ─► Orchestrator ────┤
                                              ▼
        Coach(assess) ─► Recovery(gate, verdict) ─► Coach(revise whole week)
                                              ▼
        Planner(place vs live Google Calendar) ─► [conflict? user/coach loop]
                                              ▼
        per-session approval cards ─► user approves ─► commit (tentative→committed)
                                              ▼
                          Planner writes Google Calendar events
```

### External APIs

- **Garmin Connect** — via the Python fetch service (auth + metric extraction).
- **Google Calendar** — per-user OAuth; the backend holds a refresh token and a CRUD
  client that reads busy/free and writes only app-owned events.
- **OpenAI (GPT-4o)** — all agents and classifiers. Optional at boot; every agent feature
  returns `503 OPENAI_NOT_CONFIGURED` until a key is set.

---

## Security

**What's sensitive:** Garmin credentials/sessions, Google OAuth refresh tokens, JWT signing
secrets, the OpenAI key, and a user's personal health/biometric data (HRV, sleep, resting
HR) and their private calendar.

**How it's protected:**

- **Credentials encrypted at rest** — integration secrets (Garmin session, Google refresh
  token) are stored with **AES-256-GCM authenticated encryption**
  (`common/crypto/crypto.service.ts`). The key comes from `CREDENTIALS_ENCRYPTION_KEY`
  (a secrets manager/KMS in production, never the DB), so a database leak yields useless
  ciphertext. Format is versioned (`v1:<iv>:<authTag>:<ciphertext>`).
- **Fail-fast config** — env vars are validated at boot (`config/env.validation.ts`); the
  app refuses to start with missing/invalid secrets. Two *distinct* JWT secrets (access +
  refresh), min 32 chars each, are required.
- **Stateless fetch service** — the Python service owns no database and no persistence:
  credentials in, metrics out. Nothing sensitive is stored on that hop.
- **Secrets never committed** — `.gitignore` excludes `.env*` (except `.env.example`),
  `.garmin_tokens/`, `*.pem`, `*.key`. Only an `.env.example` template lives in the repo.
- **Auth** — JWT access/refresh with `argon2` password hashing; passport-jwt guards;
  short access TTL (default 15 min) with longer refresh.

**What the agents can and can't do:**

- Agents **never write to the database directly** — only through CQRS commands, keeping
  every guardrail in one place.
- **Single writer per resource** — the Recovery Guru is advisory only and never edits
  sessions; the Coach owns content; the Planner owns scheduling.
- **Calendar least privilege** — the Planner reads all events for clash detection but
  writes/edits/deletes **only training events it created** (verified via
  `extendedProperties.private.appId`). It never touches a user's personal events.
- **Bounded loops** — each agent runs a capped tool-using loop (6–8 iterations) so a
  misbehaving prompt can't run away with cost or latency.

**Guardrails / defense in depth:**

- **Numeric safety encoded in prompts *and* enforced by code** — a post-generation
  validator caps weekly load increase (~10%), enforces deload cadence, and caps
  intensity when readiness is low. The LLM advises; code enforces those three.
  The ACWR ≤1.3 threshold is currently prompt guidance only — not yet a
  code-level check like the other three — and is disclosed as a known gap
  rather than overclaimed (see the Known Gaps note below).
- **Pre-write validators** — the Planner's irreversible calendar write is guarded by a
  thin code validator (rejects overlaps, hard blocked-window violations, bad tz→UTC,
  duration-doesn't-fit) that bounces invalid placements back to the LLM.
- **Fail-safe saga** — all writes are tentative until approval; the real Google event is
  created only at commit. Retries exhausted → abort and write nothing → zero user-visible
  damage. (There is no dead-letter queue today — a failed run aborts cleanly rather than
  being persisted for replay; that's a gap, not a shipped feature.)
- **Idempotency + single-flight** — a Redis-backed idempotency key (SET-NX with TTL)
  prevents double-writes on retry; a hand-rolled per-user pipeline queue (in-process
  promise chain + Redis mutex, concurrency = 1) serializes a scheduled fetch and a
  simultaneous mid-chat change so they never race.

**Human-in-the-loop:** Generated and revised weeks are never applied silently — they
arrive as per-session approval cards (approve / revise / reject), each showing its
rationale and diff. Any negative or missed session triggers a clarifying question rather
than a silent guess. The only immediate-fire exceptions are safety signals
(`injury_or_illness`, `overreaching`).

**Real vs. fake data:** the platform is built around *real* user biometric and calendar
data — there is no synthetic-data masking layer, which is exactly why credential
encryption, least-privilege calendar writes, and fail-safe approvals matter.

**Known gaps, disclosed rather than hidden:**
- The ACWR ≤1.3 threshold is currently prompt guidance only, not yet a code-level
  check the way the 10% weekly load cap is.
- There is no dead-letter queue; a failed pipeline run aborts and writes nothing
  rather than persisting for replay.
- `BullMQ` is a listed `package.json` dependency but is not actually used — the
  pipeline queue and idempotency store are hand-rolled on top of Redis directly.

---

## Goals

1. **OpenClaw-level personalization, safely.** Deliver a program that genuinely adapts to
   the individual — goal, daily readiness, schedule, and preferences — without ever
   prescribing something that risks injury. Success = the plan changes intelligently in
   response to real signals, and the safety guardrails are never breached.
2. **Trustworthy autonomy.** The agents do real work autonomously, but every irreversible
   action is gated by a human approval and every decision is explainable on demand. Success
   = users let it run because they can see *why* it did what it did.
3. **A clean, extensible reasoning layer.** Keep intelligence inside bounded agents and
   coordination inside deterministic, replayable orchestration on top of an unchanged
   DDD/CQRS core. Success = new triggers/pipelines are added by composition, not by
   rewriting tested domain code.

---

## Customers

**Who it's for:** committed amateur and intermediate endurance/strength athletes who train
toward a concrete goal (a race, a strength target, a body-composition goal), already wear a
Garmin device, and live by their calendar. People who would otherwise pay for a human coach
or wrestle with a rigid static plan from a generic app.

**Why they'd choose it:**

- It adapts **daily** to their actual recovery instead of handing them a fixed PDF.
- It schedules training into the time they *actually* have, against their real calendar,
  instead of assuming an idealized week.
- It explains every decision and takes feedback in plain language — closer to a real coach
  than a workout-logger.
- It keeps them in control: nothing changes without their approval, and it errs toward
  safety over pushing volume.
