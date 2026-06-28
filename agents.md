# Multi-Agent Coaching System — Design Blueprint (Interview In Progress)

## Context / Why
The `coach-platform` backend (NestJS + MongoDB, CQRS) already has a complete data + personalization
foundation but **no LLM/agent layer**. The goal is to build a multi-agent AI system on top of it that
delivers OpenClaw-level personalization: agents that generate, gate, schedule, explain, and continuously
revise a user's training program toward their goal — reacting to performance, recovery, adherence, and
explicit preferences.

Five participants:
- **Coach** — generates the periodized program and the concrete weekly sessions; pushes the user toward the goal.
- **Recovery Guru** — advisory readiness gate; prevents injury by judging whether the user's state aligns with the plan.
- **Planner** — owns the calendar; places sessions into real time slots and syncs Google Calendar.
- **Orchestrator** — deterministic code coordinating the LLM specialists per trigger.
- **Chat Assistant** — conversational surface for Q&A and for capturing/triggering changes.

Triggers that drive a session/weekly change: `'revision' | 'outcome' | 'assistant' | 'session_flush'`,
plus a code-scheduled `fetch` (session-day) pipeline.

---

## Existing foundation (confirmed via codebase exploration)
- **Stack:** NestJS, MongoDB (Mongoose), CQRS (commands/queries/events).
- **Modules:** training, program, planned-sessions, sessions, performance, recovery, exercises,
  personalization, ingestion, integrations, program-matching, users, auth.
- **Personalization pipeline:** append-only `preference_events` → distilled `user_preferences` projection
  (rebuildable via `rebuild-projection.handler.ts`) → `context-builder.service.ts` →
  `prompt-flattener.ts` → `promptText`. Context slices exist: `GenerationContext`, `RecoveryContext`,
  `SchedulingContext` (all currently **preference-only**).
- **Collections:** users, auth_*, user_integrations, training_profiles, programs, planned_sessions,
  sessions, recovery_daily, performance_daily, performance_profile, preference_events,
  user_preferences, health_constraints.
- **Integrations:** Garmin (ingests sessions/recovery/performance), Google Calendar **OAuth only**
  (refresh token; NO event CRUD client yet; `calendarSync` is a schema placeholder).
- **Gaps to build:** LLM client + agents; orchestrator; Google Calendar CRUD client; extend context
  builders with domain facts; fix `flattenProjectionToPrompt` (drops setpoints).

---

## RESOLVED FOUNDATIONS

### Q1 — Memory substrate: single structured source of truth
Mongo `preference_events` → `user_preferences` projection stays **canonical** for all steering signals.
No OpenClaw file-first/markdown layer. The existing append-only log + deterministic replay already gives
the "files-as-truth + rebuildable index" property OpenClaw prizes. OpenClaw is inspiration only, not a
second store (avoids dual-write drift).

### Q2 — Agent execution model: bounded tool-using loops
Each specialist runs as a **bounded tool-using agentic loop** (capped iterations, e.g. 6–8), **pre-seeded**
with a curated context slice so the common case needs **zero** tool calls. Read-tools fetch more on demand;
write actions are explicit **terminal** tools. Autonomy without unbounded cost/latency.

### Q3 — Context split: bounded facts seeded, unbounded history via tools
Initial context built fresh from projection + logs + Mongo schemas. **Pre-seed** the small, always-needed,
O(1)-per-run facts. **Tool-fetch** unbounded history (full workout log, long trends, old pref events,
whole-program/horizon questions). Existing context slices are preference-only and must be **extended/rebuilt**
to carry domain facts.

---

## AGENT 1 — COACH (fully specified)

### Authority (Coach Q1) — two operations, one brain
- `generateProgram` — runs once at program start and on major goal change. Lays down the ~12-week
  periodization skeleton (themes base→build→peak→deload/taper + weekly `plannedLoadTarget`). All weeks
  `tentative` except the current one (**rolling-horizon planning**).
- `generateWeek` — runs weekly / on trigger. Turns the current skeleton week into concrete `planned_sessions`.
  Commits only the imminent week; future weeks stay tentative so near-term detail can react to
  outcomes/recovery. Skeleton is the guardrail so weekly generation never drifts from the goal.

### Initial context / pre-seed (Coach Q2/Q3)
1. **Goal block** — `goalSnapshot` (primaryGoal, note, horizonDate), discipline, weeks-until-goal.
2. **Full program skeleton** — all ~12 weeks (theme, `plannedLoadTarget`, `planState`), `currentWeekIndex`.
3. **planned_sessions** — current week + **last 2 weeks**: prescription + `outcome`
   (status, reasonCode, perceivedEffort/RPE, enjoyment, matchedActivityId).
4. **observed `sessions`** — **last 7 days** (executed numbers).
5. **performance_daily** — latest 5 aggregates (running_tolerance, weekly_distance_km,
   weekly_intensity_moderate/vigorous, weekly_volume_load) + **4-week** trend direction.
6. **performance_profile** — current value per metric (vo2max, lt_hr, race_pred_5k_sec, endurance_score,
   1rm.SQUAT, 1rm.BENCH_PRESS) + last delta ("evolved/decreased").
7. **recovery_daily** — **7-day** readiness/ACWR rollup only (thin signal; deep recovery is the Guru's job).
8. **Personalization (`GenerationContext`)** — projection + active one-offs + last 10 standing events +
   active health constraints.

### Context delivery (Coach Q4)
Numeric setpoints/projection → **JSON** (consumed programmatically); qualitative nuance → **flattened prose**.
**MUST FIX `flattenProjectionToPrompt`** — it currently drops decision-critical fields: `weeklyKm`,
`sessionsPerWeek`, `sessionDurationMin`, `defaultSets`, `defaultReps`, `exercisesPerSession`,
`splitPreference`, `preferredRunTypes`, `avoidedRunTypes`, `targetMuscleGroups`, `exercisePrescriptions`,
`experienceLevel`, `primaryGoal`.

### Tools (Coach Q5)
- **Read:** `query_planned_sessions`, `query_sessions`, `query_performance`, `get_preference_events`,
  `search_exercise_catalog` (essential — 700+ catalog, equipment/constraint-aware), `get_exercise_detail`.
- **Write (terminal):** `commit_program_skeleton`, `upsert_week_sessions` (writes `planState: tentative`
  ONLY; approval flips → committed + triggers calendar sync). Always writes `coachNotes` rationale.
- **No deep-recovery tool** — gets the Recovery Guru's verdict via the orchestrator (clean responsibility split).

### System prompt (Coach Q6)
Stable layer (dynamic data stays in the seed message for cacheability): role/mission, input guide,
**hard rules** (never prescribe a `health_constraint` `avoid` exercise; honor blocked windows; respect
removed equipment), **soft rules** (bias to preferred exercises/modalities; apply volume/intensity/diversity
biases), **method** (periodization, progressive overload, autoregulation), **adherence logic** (repeated
skips → adjust, don't pile on), **output contract** (upsert schema + coachNotes), **escalation**.
**Numeric safety guardrails encoded in prompt AND enforced by a code-side post-generation validator
(defense in depth):** ≤~10% weekly load increase, ACWR kept ≤~1.3, mandatory deload cadence, intensity cap
when the Recovery Guru flags low readiness. Exercise selection / session texture / motivation left qualitative.

### Output boundary (Coach Q7)
Coach emits **sequencing/spacing intent + day-type hints + `estDurationMin`** (it owns duration since it
created the content), NOT firm calendar slots. The Planner owns
`scheduledDate`/`startTime`/`endTime`/`scheduledStartUtc` against the real calendar + availability + windows.

---

## AGENT 2 — RECOVERY GURU (fully specified)

### Authority (RG Q1) — advisory only
Emits a structured readiness verdict the Coach consumes; **never edits `planned_sessions`** (single writer
per resource). Any fatigue-signal logging is done by the orchestrator on the verdict, not by the Guru.

### CRITICAL GAP
The existing `RecoveryContext` carries **zero physiological data** (only health constraints + intensity
biases + setback events). The Guru's seed **must be extended** to read `recovery_daily` + `sessions`.

### Initial context / pre-seed (RG Q2 — full set)
1. **Today's full `recovery_daily` snapshot** — HRV, hrv_status, resting_hr, sleep_score/minutes/deep/rem,
   training_readiness_score/level, recovery_time_min, body_battery_morning_peak/lowest, acute_load,
   chronic_load, acwr_ratio/status, training_status, respiration, spo2, stress, intensity minutes.
2. **7-day trend** — hrv_last_night, resting_hr, sleep_score/minutes, training_readiness_score,
   body_battery_*, acwr_ratio/status.
3. **Baselines** — hrv_baseline_low/high, sleep_need_minutes (for relative judgment).
4. **7-day observed sessions load (objective)** — date, type, training_load, aerobic_te/anaerobic_te,
   te_label, duration_min, avg/max_hr.
5. **This-week outcomes (subjective)** — status, perceivedEffort (RPE), enjoyment, reasonCode.
6. **Plan under review** — imminent session (full prescription + intensityLabel + estDurationMin) + the rest
   of the current week's sessions.
7. **health_constraints** (active).
8. **intensityBias** (running + strength).
9. **recentSetbacks** (last 10, filtered: injury, injury_or_illness, too_hard, no_motivation).
- Delivery: numeric (1–6, 8) JSON; constraints + setbacks (7, 9) prose.
- Tools for depth: `query_recovery(dateRange)` >7d, `query_sessions`/`query_performance` to correlate
  load↔recovery.

### System prompt (RG Q3) — explicit gate thresholds, qualitative remedy
Role = injury-prevention gate. **Explicit numeric thresholds for the verdict** (map onto Coach guardrails):
- **RED:** acwr_ratio > ~1.5, OR training_readiness very low, OR HRV well below hrv_baseline_low for
  multiple days, OR an active `avoid` constraint conflicts with today's session.
- **AMBER:** milder versions (single-day HRV dip, moderate sleep debt, acwr 1.3–1.5).
- **GREEN:** otherwise.
Remedy (which modification) is qualitative judgment.
**Advice style:** 2nd person; lead with the driver then the action; cite only `drivers` (never invent
metrics); one primary recommendation; green = brief affirmation. Defense in depth: Guru advises, Coach's
code validator enforces the cap.

### Output contract / action space (RG Q4, Q5)
Verdict always = `{ readiness: green|amber|red, drivers[] (metric+value), recommendation, params, rationale }`.
Closed recommendation enum (free text NOT allowed for the action):
- `proceed` — train as planned.
- `reduce_volume` (volumePct) — fewer sets/reps/distance.
- `reduce_intensity` (intensityCap = HR zone / RPE / pace ceiling).
- `shorten_session` (durationCapMin).
- `swap_to_active_recovery` (activeType = mobility/easy/walk).
- `rest_day` — rest, free the slot.
- (`reschedule` REMOVED — Planner owns timing.)

### Trigger scope (RG Q5)
A Guru verdict triggers the Coach to **re-plan the ENTIRE current week**, not just today's session
(see derivation policy).

### Tools
Read-only: `query_recovery(dateRange)`, `query_sessions`, `query_performance`. No write tools.

---

## AGENT 3 — PLANNER (fully specified)

### Calendar state gap
Google integration today = OAuth only (refresh token). No calendar CRUD client; `get-calendar-range`
queries `planned_sessions` not Google; `calendarSync` unwired. **MUST build a Google Calendar client**
(listEvents/freebusy, insert/update/delete) on the stored refresh token.

### Read/write policy (Planner Q1)
- **READ** all real Google events in the target window (busy/free + titles) for clash detection.
- **WRITE/edit/delete ONLY training events it created** — tagged via `calendarSync.eventId` + Google
  `extendedProperties.private` (appId + plannedSessionId). Never touches the user's personal events.
- `planned_sessions` = **source of truth**; the Google event is an idempotent downstream projection
  (`syncState` pending→synced→failed). On divergence, the planned session wins and re-syncs.

### Coach→Planner handoff (confirmed)
Coach supplies the session list: content + `estDurationMin` + the **count** of sessions + sequencing/spacing
intent + day-type hints + the weekly anchor. Planner owns `scheduledDate`/`startTime`/`endTime`/
`scheduledStartUtc` on the planned session AND the Google event date/time.

### Initial context / pre-seed
Coach's session list (content summary + estDurationMin + count + spacing/day-type intent + weekly anchor);
target week window; **freshly-fetched real Google events** in window (real-time busy/free + titles);
availability slots (training-profile recurring day/start/end); `SchedulingContext` (blocked HARD + preferred
windows + time one-offs); timezone; already-committed sessions this week.

### Slot-finding (Planner Q2/Q3) — LLM decides, code guards
- **LLM makes the full placement decision**, reasoning over raw calendar (NO deterministic slot-finder).
- A thin **pre-write validator (code)** guards the irreversible write: rejects calendar overlap, HARD
  blocked-window violation, bad timezone→UTC conversion, duration-doesn't-fit; bounces the reason back to
  the LLM to re-decide. The validator never *decides* placement, only refuses to persist/sync an invalid one.

### Conflict / can't-fit-all-N (Planner Q4/Q5) — user-first, non-blocking
Planner NEVER silently drops or overflows a HARD blocked window. Emits placement report
`{ placed[], unplaceable[{ sessionRef, reason, nearestRejectedOptions[] }] }`. **Gate ordering:**
1. Planner auto-relaxes SOFT preferences silently; if it now fits → done (just note it).
2. Else the Coach computes a fallback sacrifice (which session to drop/shorten by training priority) as a
   **reversible `tentative` default**.
3. User sees ONE consolidated card: a complete valid week WITH the sacrifice applied + the non-destructive
   alternative ("free Tue 6–7pm and I'll keep it").
4. User approves as-is OR frees/adds a slot → re-run placement, **restore** the session (sacrifice was never
   committed → nothing wasted).
- Coach owns WHICH session to sacrifice (training priority); user owns WHETHER to overflow/free time;
  orchestrator routes between them.

### Tools (Planner Q6)
- Read: `list_calendar_events(window)`, `get_availability()`, `query_planned_sessions(window)`.
- Write: `upsert_session_schedule(...)`, `sync_calendar_event(create|update|delete, owned only)`,
  `emit_placement_report(...)`.
- System prompt: scheduler role; ABSOLUTE (honor HARD blocked windows + real busy + tz→UTC + never touch
  non-owned events); RESPECT Coach spacing/day-type + place the weekly anchor; SOFT (bias to preferred
  windows); infeasible → emit report, never drop.

### Timing (Planner Q6)
Placement = write app-side schedule on the tentative session + validate vs the LIVE calendar. The **real
Google event is created ONLY at commit (post-approval)** when `planState` flips tentative→committed.
A re-placement before approval just overwrites app-side fields — zero external calendar churn.

---

## COACH ↔ RECOVERY derivation policy (drives Coach `generateWeek` on a verdict)
When the Coach accepts a Guru recommendation, it re-plans the **whole current week**:
- `reduce_volume`: cut today; redistribute lost volume to a later good-readiness day ONLY if within ACWR
  ceiling + hard-day spacing, else absorb (lower week volume, keep theme).
- `reduce_intensity`: today's hard → easy; the hard stimulus shifts to the next eligible day (≥48h spacing,
  readiness OK) or is dropped; never stacked adjacent.
- `shorten_session`: trim estDurationMin/volume; usually absorbed.
- `swap_to_active_recovery`: today → recovery; displaced key session reinserted later if a safe slot exists,
  else dropped; lower the weekly target.
- `rest_day`: drop today, Planner frees the slot; if RED from high ACWR → intentional micro-deload (reduce
  week target, recompute, DON'T make up the work).
- **Invariants:** redistribution never breaches the ACWR ceiling / hard-day spacing / ~10% weekly cap.
  **Default = absorb, not cram.** Any week-level change re-enters the Planner to adjust calendar events.

---

## ORCHESTRATOR

### Q1 — Type
Deterministic code (state machine / saga) coordinating LLM specialists. NOT an LLM manager. Inherits
CQRS-style retries / idempotency / observability / replay. LLM intelligence lives **inside** each agent;
the chat assistant is the only free-form router.

### Q2 — Fetch / session-day pipeline (confirmed)
`fetch → Coach(assess) → Recovery(gate) → Coach(revise) → Planner(place) → [conflict? → Coach/User loop]
→ approval → commit+sync`. Heaviest pipeline; the only one that always runs the Recovery gate. Adherence
detection (did the workout happen) = code via existing `SessionMatcherService`.

### Q4 — Pipeline catalog + deterministic routing (RESOLVED)
The orchestrator owns a fixed catalog of pipelines and always runs the **minimal sufficient** one. The
**assistant only extracts the tagged `preference_event`**; a **deterministic tag-type → pipeline table** in
the orchestrator selects the pipeline (NOT an LLM judgment — keeps choreography centralized + replayable).

| # | Pipeline | Stages | Fired by |
|---|----------|--------|----------|
| 1 | **Full session-day (fetch)** | Coach(assess) → Recovery(gate) → Coach(revise) → Planner(place) → [conflict loop] → approval → commit+sync | scheduled `fetch`; only pipeline that ALWAYS runs Recovery |
| 2 | **Safety re-plan** | Recovery(gate) → Coach(revise whole week) → Planner → approval | injury/illness, "back hurts", "exhausted"; low-readiness escalation |
| 3 | **Content re-plan** | Coach(re-plan week) → Planner(re-place) → approval | content/training tags ("remove exercise", "drop km", "too hard"); batched revisions |
| 4 | **Timing-only re-place** | Planner(re-place) → calendar re-sync → approval | timing-only tags ("move to 7am", "before 9am") — NO Coach |
| 5 | **Program generation** | Coach(`generateProgram` skeleton) → Coach(`generateWeek` wk1) → Planner → approval | program start / major goal change |
| 6 | **Write-only (no agents)** | append `preference_event` → rebuild projection | no-current-week-impact prefs; implicit batched signals; `session_flush` extraction |

Pipelines 2–4 are **entry-point subsets** of pipeline 1 (same agents/stages, skip what the change doesn't
touch). Outcome-HITL replies route into 2 / 3 / 6 by the explanation given.

**Read-only Q&A is NOT a pipeline** — the assistant answers from the shared read-tool registry (A,C,E,F,J,G)
or via advisory delegation (B "why" + G verdicts). Coverage check across Q&A categories A–J surfaced **no
missing write pipeline**, but two read-surface requirements (below).

### Q5 — Q&A coverage requirements surfaced by categories A–J (RESOLVED)
- **Persist-rationale is a HARD write-rule** for self-explanation (category B). Every decision writes its
  "why" at decision time: **Coach → `coachNotes`** (content: deload, swap, volume, exercise count), **Planner
  → placement note** (timing: why this slot/day). The assistant answers "why…?" by **retrieving** the
  relevant note; if absent, it delegates to that agent in advisory mode for a fresh rationale. No pipeline.
- **Two aggregate read capabilities** added to the shared registry (categories H, I — still retrieval-side,
  not judgment): (a) an **adherence/outcome aggregate** tool (completion rate, skip counts, most-skipped
  exercise, skipped-by-time-of-day) over `planned_sessions.outcome`; (b) **cross-source correlation**
  composed from existing read-tools (sessions × recovery × outcomes — "too hard when HRV low?", "run more on
  well-slept days?", "enjoyment by run_type"). No pipeline.

### Q3 — Chat assistant role
**Separate agent**, not the orchestrator; it is one *client* of the orchestrator. Three tiers of capability:
- (a) **Direct read-tools** for factual/historical/aggregate Q&A.
- (b) **Agent-as-tool delegation** to Coach/Recovery for verdict-type questions (e.g. "am I recovered enough
  today?" → Recovery; "should I swap squats?" → Coach) — avoids two sources of truth.
- (c) **Triggers the deterministic pipeline** for any write/change; it never holds specialist write tools, so
  all guardrails stay centralized.

**Q4 — answer-directly vs delegate dividing line (RESOLVED):**
- **Retrieval / aggregation of existing facts → answer DIRECTLY** with read-tools (no judgment): "what's my
  HRV trend", "how many sessions last week", "what's Thursday's workout".
- **Anything requiring a specialist verdict or projection → DELEGATE (agent-as-tool):** "am I recovered
  enough today?" → Recovery; "should I swap squats / am I on track for the goal?" → Coach.
- Rule of thumb: **retrieval → direct, judgment → delegate.** Judgment has exactly one owner; the chat never
  reproduces coaching/recovery logic.

**Q5 — delegation contract: opinion vs action (RESOLVED):**
- A specialist invoked **as-a-tool by the assistant runs in read-only "advisory mode"**: same seeded context
  + read-tools, but its **terminal write tools are withheld**. It returns a **structured verdict/explanation
  object only** (Recovery `{readiness, drivers, recommendation, rationale}`; Coach assessment + rationale) —
  never a persisted change.
- If the user then says "do it" → that's a **black/explicit change** → the normal pipeline fires the
  specialist **with** write authority.
- **Delegation = "ask for an opinion"; pipeline = "make the change."** Same brain, two authority levels;
  guardrails + writes stay centralized in the pipeline.

**Q6 — read-tool surface: shared registry (RESOLVED):**
- All read-tools live in **one shared read-tool registry**, defined/tested once and granted by reference.
- **Assistant = union of every read-tool:** `query_planned_sessions`, `query_sessions`, `query_performance`,
  `query_recovery`, `get_preference_events`, `search_exercise_catalog` / `get_exercise_detail`,
  `list_calendar_events`, `get_availability`. Covers all Q&A categories from one surface.
- **Specialists = scoped subsets** of the same registry (Coach: planned/sessions/performance/prefs/catalog;
  Recovery: recovery/sessions/performance; Planner: calendar/availability/planned).
- Single tested implementation per tool, shared — no re-implementation, no drift.

---

## TRIGGERS (resolving one-at-a-time)

### Trigger classification (proposed; being confirmed individually)
| Trigger | Origin | LLM (harness) parts | Deterministic parts |
|---|---|---|---|
| fetch / session-day | Code (scheduler) | Coach/Recovery/Planner reasoning steps | orchestration; adherence detection (SessionMatcherService) |
| revision | User | free-text tag extraction (if any); Coach regenerate | structured card → tag write; projection rebuild; pipeline |
| outcome | Code-detected (+ user marks) | HITL feedback understanding (assistant-style); Coach adjust | detection; event mapping; gate |
| assistant | User | intent understanding, event extraction, routing | the fired pipeline; all writes |
| session_flush | Code (teardown) | durable-memory extraction (OpenClaw-style) | event write; projection rebuild |
**Principle:** orchestration, routing gates, and structured capture are deterministic; the LLM is used only
for free-text/conversation understanding and the specialist reasoning steps. No trigger is an end-to-end LLM
harness.

### outcome trigger — RESOLVED (simplified: HITL-for-all-negative, no heuristic gate)
**Design principle:** no silent difficulty-proxy gate. ANY negative or missed outcome → ask the user a
clarifying question → understand the reply (assistant LLM) → act like a **revision / mid-chat**. The Coach
does the nuanced "are upcoming sessions also too hard" reasoning WITH the user's actual explanation in hand.

- **Detection (code, the only deterministic part):**
  - A quick **post-session outcome card** captures the structured signal (`status`, `reasonCode`, RPE,
    enjoyment).
  - `SessionMatcherService` flags **misses** (planned session with no matched activity after its end).
- **Negative/missed → HITL clarifying question** for: `missed`, `too_hard`, `too_easy`,
  `volume_too_high/low`, `no_motivation`, `disliked_exercise`, `disliked_time`, `deviated`. Proactively ask
  "what made it hard / what happened?" — **batched at END OF SCHEDULED DAY** in user TZ (Q2 ✓).
- **Understand + route (assistant LLM):** reply handled exactly like a mid-chat/revision turn → extract
  structured `preference_event` (standing→revision, transient→one-off) → route into pipeline so the Coach
  eases/adjusts upcoming sessions if warranted.
- **Clean/positive completions → NO question** (no interruption).
- **`injury_or_illness` → immediate-fire** to Coach + Recovery regardless (Q3 ✓).
- **Reuses the assistant/revision machinery** — unique parts are only *detection* + *deciding when to ask*.

### assistant / mid-chat trigger — RESOLVED (white/black/gray dispatch + firing boundary)
Covers category-D mid-chat changes ("drop km to 25", "I hate burpees", "my back hurts", "45-min max").

**Per-turn classifier (LLM, the assistant's first step)** routes every turn into one of three lanes:

- **WHITE = query** ("how's my HRV / performance / what does my week look like"). Answer via direct
  read-tools, or **agent-as-tool delegation** to Recovery/Coach for verdict-type questions. **No write, no
  trigger.** A query NEVER fires a re-plan.
- **BLACK = explicit order** ("drop Friday", "remove burpees", "25 km max", "45-min cap"). Eager-write the
  structured `preference_event(s)` (durability standing/one-off, `confidence: explicit`) immediately
  (append-only log = cheap, auditable, source of truth) and **reflect back** the understanding.
- **GRAY = soft / ambiguous signal** ("I don't like burpees", "last run felt hard"). The assistant
  **investigates first with a read-tool** — scans upcoming sessions, surfaces the concrete relevant item
  (the looming hard run, burpees next Thursday) — and asks ONE **grounded** clarifying question to convert
  gray → explicit. If the user confirms → it becomes BLACK (acts). If no explicit confirmation → demote to
  **IMPLICIT** (`confidence: inferred`, batched, needs reinforcement — same lane as session_flush).

**Firing boundary (the eager-write vs lazy-regenerate seam):**
- **Implicit → always batched.** Accumulate under one `batchId` (reuse `submit-weekly-revisions`); folded in
  by the next scheduled `generateWeek` from the projection. No immediate re-plan.
- **Explicit → fires the pipeline NOW *iff* it affects the weekly session** (current committed-week content
  or schedule). Returns the normal approval card inline.
- **Explicit but does NOT touch the current week** (e.g. a standing preference that only affects future
  tentative weeks) → write the event immediately (never lose intent) but **NO immediate re-plan**; the next
  scheduled generation picks it up. Avoids one re-plan per sentence.
- **Safety exception — immediate-fire:** `injury_or_illness` → write `health_constraint` + immediate-fire
  Coach+Recovery, no debounce, regardless of week boundary.

Cheap eager write (never lose intent) decoupled from expensive lazy regeneration; the firing test is
"does this change the week the user is about to train."

**Propagation model (direct vs indirect) — rolling-horizon applied to chat:**
- EVERY explicit change writes to the **log (`preference_events`)** and updates the **projection
  (`user_preferences`)** — unconditionally. That is the canonical, always-on effect.
- **Direct effect = the current committed week only:** if the change touches it, fire the pipeline now to
  re-plan it.
- **Future (tentative) weeks are NEVER re-planned directly by a mid-chat change.** They are affected
  *indirectly*: when `generateWeek` later promotes a tentative week, it reads the (now-updated) projection +
  logs + accumulated past sessions, so the change propagates organically.
- This keeps a single source of truth (no reaching forward to hand-edit a future week) and bounds re-plan
  cost to the one week the user is actually about to train.

### revision trigger — RESOLVED
Structured weekly-revision cards (NotebookLM-style batch) via existing `submit-weekly-revisions` + `batchId`.
Capture is **deterministic** (card → tag mapping; no LLM extraction). **Regeneration scope** = whole-week
re-plan, revisions as hard constraints, minimal-diff with invariant-driven ripples (see Approval Flow Q2).

### session_flush trigger — RESOLVED (durable-memory extraction, OpenClaw-style)
Fires on **conversation teardown / pre-compaction** (the OpenClaw "flush before you forget" moment).
- **Extraction (LLM):** scan the just-ended conversation for **NEW inferred signals** not already captured as
  explicit events this session (preferences, dislikes, recurring friction) → emit `preference_event`s with
  `confidence: inferred`.
- **Dedupe:** against this conversation's `batchId` so a signal already eager-written as explicit (black) is
  NOT re-appended.
- **Reinforcement, not action:** inferred events need reinforcement to cross threshold per
  `PERSONALIZATION_CONFIG` (inferredDislikeSupport:3 / inferredLikeSupport:2, decayDays:90, maxBias:0.5) —
  one flush never directly changes the plan.
- **Effect = write + rebuild projection only (pipeline 6).** NO immediate re-plan.
- **Exception:** a missed *explicit* safety signal noticed at flush (e.g. an injury mentioned but never
  captured) escalates immediately to Coach+Recovery.

---

## APPROVAL / CARD FLOW (RESOLVED — per-session cards, batched revision)

### Q1 — granularity & response actions
A generated week is presented as a **batch of per-session cards** (NotebookLM-slide model): each session card
shows its prescription + `coachNotes` rationale + diff vs current + any Planner placement note / Recovery
driver. The user can **revise each card individually**, then **submit the whole batch together** → ONE
re-plan (reuses `submit-weekly-revisions` + `batchId`). Three actions:
- **Approve** → flip `tentative`→`committed`; fire Planner calendar sync.
- **Revise-with-feedback (per card, batched)** → each card's free-text/structured edit captured as a
  `preference_event`; the batch re-enters as a **revision-shaped trigger** → fresh card set (bounded retries).
- **Reject / keep-current** → discard the tentative draft, commit nothing — **ONLY allowed when a committed
  week already exists to fall back to.** On the **first generation of a week there is no reject**; the user
  can only Approve or Revise (nothing to keep).

### Q2 — regeneration scope on a batched revision (RESOLVED)
When the revision batch returns, the Coach **re-plans the whole week**, treating each per-card revision as a
**hard constraint**, but biases to **minimal-diff**: un-revised sessions are preserved as-is unless a
week-level invariant (ACWR ceiling, hard-day spacing, ~10% weekly load cap) forces a ripple. Volume /
intensity / spacing are week-scoped, so editing one session can legitimately shift another; freezing
untouched sessions outright could yield an unsafe week. The fresh card set **highlights any ripple** so the
user sees why an unedited session changed. Any week-level change re-enters the Planner to adjust calendar.

---

## CROSS-CUTTING ARCHITECTURE

### Module placement (RESOLVED)
New top-level **`agents` module**:
- **Shared infra:** LLM client, bounded agentic-loop runtime, the shared **read-tool registry**,
  structured-output layer.
- **Per-specialist submodules:** `agents/coach`, `agents/recovery`, `agents/planner`, `agents/assistant`.
- **`agents/orchestrator`** saga = deterministic state machine owning the pipeline catalog + tag-routing.
- **Writes go THROUGH existing CQRS commands** (Coach `upsert_week_sessions` → `planned-sessions` command;
  Planner schedule write → its command; preference writes → `preference_events` command), never touching
  repositories directly. Domain modules keep write ownership; the agent layer is a thin reasoning tier.

### Infra tier (RESOLVED)
1. **LLM provider/client:** **OpenAI GPT-4o across the board** for all agents + classifiers (keep simple;
   tier per-agent later if cost/latency demands).
2. **Structured output:** native **tool-calling / JSON-schema mode backed by Zod schemas** for strict,
   type-safe contract enforcement in NestJS (verdict / `upsert_week_sessions` / placement contracts).
3. **Observability & cost:** **backend** logs token consumption for *every* API call + which agent ran, when
   it fired, which tools it invoked. **Frontend** exposes the agentic workflow live in chat ("Coach is
   evaluating your week…", "Calling Calendar Tool…") — but **hides raw token counts** from the end-user.
4. **Idempotency:** per-trigger-run key (UUID / reuse `batchId`) mapped in **Redis** so retries/replays
   don't double-write; industry-standard dedupe at pipeline entry.

### Operational tier (RESOLVED)
5. **Concurrency / serialization — per-user single-flight queue.** **BullMQ on Redis, concurrency = 1 per
   `userId`** — a scheduled `fetch` mid-run and a simultaneous mid-chat change serialize, never race. Safe
   because every pipeline reads fresh state at start and writes **tentative-only until approval** (later run
   sees earlier run's result → no lost update). Defense in depth: optimistic-concurrency `version` field on
   `planned_sessions`/`program`. **Eager `preference_event` writes happen OUTSIDE the lock** (append-only,
   never lost). A newer run for the same week **invalidates any unapproved pending card** (supersession).
6. **Cold start — lean on onboarding + initial wearable sync.** Empty-seed users: seed from the **onboarding
   survey** + the **initial historical sync** pulled from the wearable. Null fields **fall back gracefully to
   onboarding baseline metrics**. Pipeline 5 (program generation) runs against this seed.
7. **Failure / timeout — saga that fails safe, never partial-commits.** Per-agent timeout + bounded retries
   with backoff (transient errors retried; validator-bounce handles bad output). **Retries exhausted → abort
   run, write nothing** (all writes tentative until commit; Google event only at commit → zero user-visible
   damage on abort). Idempotency key makes a retried run replace, not duplicate. **Degraded fallback for the
   always-on `fetch`:** LLM unavailable on a session-day → **fall back to last committed plan as-is** (the
   skeleton already prescribes the week), flag "couldn't adapt today." Failed runs → **dead-letter queue** +
   per-call logging.
8. **Approval delivery + TTL — rich in-app card; context-dependent TTL.** Card = rich in-app UI component in
   chat/dashboard. **Session-day/`fetch` plans:** deadline-bound to session start; if unaddressed by then →
   **auto-commit the recommendation** (already guardrail-validated + Recovery-gated), marked "auto-applied —
   tap to adjust" (a plan must exist on time). **User-initiated changes (mid-chat/revision):** tentative
   draft **expires after 24–48h inactivity → discarded, keep current committed plan** (status quo is the safe
   default; the `preference_event` already persists intent for the next scheduled generation). Superseded
   cards invalidated immediately regardless of TTL.

## RESOLVED (this session)
- All triggers: fetch, outcome, revision, assistant/mid-chat, session_flush.
- Chat Assistant: role, answer-vs-delegate dividing line, delegation contract (advisory read-only mode),
  shared read-tool registry.
- Approval / card flow: per-session cards, batched revision, reject-only-if-committed-week-exists,
  whole-week minimal-diff regeneration.
- Cross-cutting infra (LLM provider, structured output, observability, idempotency) + operational
  (concurrency, cold start, failure/timeout, approval TTL).

**Design interview COMPLETE — no open questions remain.**

---

## CHANGELOG OF DECISIONS
Q1 memory substrate · Q2 execution model · Q3 context split ·
Coach Q1–Q7 · Recovery Q1–Q5 · Planner Q1–Q6 · Derivation policy ·
Orchestrator Q1–Q5 (type, fetch pipeline, assistant role, pipeline catalog + tag-routing, Q&A coverage) ·
Triggers: fetch · outcome (HITL re-alignment) · assistant/mid-chat (white/black/gray + firing boundary +
propagation) · revision (whole-week minimal-diff) · session_flush (durable-memory extraction) ·
Chat Assistant Q4–Q6 (answer-vs-delegate, advisory delegation contract, shared read-tool registry) ·
Approval flow Q1–Q2 (per-session cards, batched revision, reject rule, regeneration scope) ·
Cross-cutting: module placement (`agents` module writing through CQRS commands).