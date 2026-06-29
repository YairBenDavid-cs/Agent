# Dual-Mode Interface + Iterative Generation + Distilled-Preference Redesign

**Status:** Draft for review (pre-implementation)
**Owner:** Yair
**Scope:** `coach-platform/api` (backend only; frontend is a downstream consumer of state/diffs we expose)
**Date:** 2026-06-29

---

## 0. Reading guide

This document is intentionally verbose. It is the single source of truth we agreed on during the design interview. It has three jobs:

1. **Freeze the decisions** so we don't re-litigate them mid-implementation.
2. **Map every decision to concrete files / symbols** that exist today (verified against the codebase), so implementation is mechanical rather than exploratory.
3. **Sequence the work** into phases that each leave the system in a compiling, test-passing state.

Sections 1–5 are design. Section 6 is the data-model delta. Sections 7–9 are pipelines, removals, and frontend contract. Section 10 is the phased build plan. Sections 11–13 are testing, migration, risk, and explicitly-deferred items.

---

## 1. Goals & non-goals

### Goals
- **G1 — Dual-mode chat.** An explicit user-controlled **Plan** (mutating) vs **Ask** (read-only consultation) toggle, analogous to Claude. Mutation capability is a boundary, never inferred.
- **G2 — Iterative, atomic generation.** Replace one-shot week generation with: **Step A** weekly macro-agreement (lock `WeeklyTargets`) → **Step B** session-by-session micro-agreement (lock one session at a time) → **Step C** scheduling phase (calendar placement, push, lock).
- **G3 — Chat-originated changes.** All change-gathering happens in conversation. The diff/revise/approve button surface is dropped. The only user action on a session is **commit**; the baseline→new diff is computed and stored for rendering.
- **G4 — Distilled preferences.** Kill the heavyweight revision-audit mechanism. At each action point, a quick LLM distillation pass collapses the iteration history into **net intent** and writes a single preference event, classified hard/soft via the existing lane/confidence axis.
- **G5 — Constraint-aware reactive edits.** User edits to a locked week are validated against current constraints; the LLM explains constraints rather than silently revising. System-initiated changes (post-sync) open a pinned, auto-named conversation.
- **G6 — Rationalized context.** Every block of context handed to the LLM is labeled with its purpose; the model is always aware of locked weekly quota and already-locked sessions.

### Non-goals (this iteration)
- **N1 — ACWR / acute:chronic workload ratio.** We use the existing load proxy (`sessionLoadProxy` / `weekLoadProxy`). ACWR is deferred (§13).
- **N2 — Frontend implementation.** We define the backend contract (state + diffs + SSE signals); the UI consumes it.
- **N3 — Multi-week look-ahead planning.** One active planning week at a time, as today.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Plan mode** | Conversation mode that can mutate program state. Holds the write tools. |
| **Ask mode** | Read-only consultation mode. Registry-level: write tools are not even registered. |
| **WeeklyTargets** | New first-class, immutable-once-locked value object: the agreed weekly quota (session count, total volume/mileage, key goals) for a program week. |
| **Action point** | The explicit user approval that locks something (weekly targets, a session, the schedule). The moment distillation + commit + (optional) pipeline fire. |
| **Distillation pass** | A bounded LLM call over the local iteration history that collapses it to net intent and emits classified preference signal(s). |
| **Lane** | Existing per-turn classification: `white` (query), `black` (explicit order → hard), `gray` (soft/ambiguous → soft). |
| **Staging buffer** | Conversation-scoped set of candidate preference signals held until an action point, then flushed as one batch. |
| **Display diff** | baseline(committed) → new(agreed) diff, persisted for the UI to render. Distinct from any preference event. |

---

## 3. Current state (verified)

What exists today, by the symbols we will touch:

- **Generation is one-shot.** `OnboardingGenerationListener` (on `TRAINING_PROFILE_CREATED`) enqueues `Pipeline.PROGRAM_GENERATION`; `CoachService.generateProgram()` / `generateWeek()` emit `commit_program_skeleton` + `upsert_week_sessions` in a single pipeline run. No weekly quota object exists.
- **Approval is card-based.** `ApprovalService` exposes `buildCards()`, `approveWeek()`, `reviseWeek()`, `rejectWeek()`, plus batch variants (`getBatchView`, `approveByBatch`, `reviseByBatch`, `rejectByBatch`). `ApprovalCardBuilder.buildApprovalCards()` diffs tentative vs committed. `approval.policy.ts` gates actions (`allowedApprovalActions`, `isActionAllowed`, `rejectionReason`).
- **Revision is heavyweight.** `reviseWeek()` captures per-card edits as `PreferenceEvent` with `source='revision'`, builds a `RevisionAudit` (`RevisionPhase = 'request' | 'result'`) keyed by a revision id, and fires `RevisionTrigger` → `Pipeline.CONTENT_REPLAN`. `recordRevisionResults()` appends the result phase post-replan. `SubmitWeeklyRevisionsCommand` / `SubmitWeeklyRevisionsHandler` batch per-card edits. Seed reads them back via `buildRevisionRequests` / `buildRevisionHistory` (in `seed/revision-context.ts`), surfaced on `CoachSeed.revisionRequests` / `CoachSeed.revisionHistory`.
- **Preference model.** `PreferenceEventSource = 'revision' | 'outcome' | 'assistant' | 'session_flush'`; `PreferenceDurability = 'standing' | 'one_off'`; `PreferenceScope = 'global' | 'session' | 'exercise'`; `TagConfidence = 'explicit' | 'inferred'`; `CURRENT_TAXONOMY_VERSION = 3`. Repository port has `findRecentRevisions`, `markRevisionsConsumed`, etc. `PreferenceIngestionService.ingest()` rebuilds the `user_preferences` projection.
- **Sessions.** `planned-session.model.ts`: `PlanState = 'committed' | 'tentative'`. Commands: `UpsertWeekSessionsCommand` (whole week), `CommitWeekCommand` (flip whole week tentative→committed), `UpsertSessionScheduleCommand`, `DiscardTentativeWeekCommand`, `UpdateCalendarSyncCommand`. `CalendarSyncState = 'pending' | 'synced' | 'failed'`.
- **Chat.** `AssistantService.handleTurn()` runs one bounded loop, ends on `assistant_turn`. `decideActions(turn, today)` performs the eager preference write and `selectPipeline()` decides whether to fire a pipeline **per turn**. Lanes in `assistant.contracts.ts`. Conversation aggregate in `conversation/domain/conversation.model.ts` with `MessageMeta { lane, capturedEventIds, pipelineRunId, cardBatchId, awaitingConfirmation }`. No mode concept.
- **Guardrails.** `coach.guardrails.ts`: `validateSkeleton`, `validateWeek`, `validateSessionStructure`, `sessionLoadProxy`, `weekLoadProxy`, caps `WEEKLY_LOAD_INCREASE_CAP`, `MAX_HARD_SESSIONS_AMBER`, `MIN_DELOAD_EVERY_WEEKS`. No quota awareness.
- **Calendar.** `CalendarSyncService.syncWeek()` runs after approval; Planner reads live calendar for busy intervals, writes real events only at commit.
- **Runtime.** `AgenticLoopRuntime.run<T>()` — validator-bounce: failed tool calls returned as tool results for retry, capped by `maxIterations`.

---

## 4. Target architecture

```
                       ┌──────────────────────────────────────────┐
                       │            Conversation (aggregate)        │
                       │  mode: 'plan' | 'ask'                       │
                       │  origin: 'user' | 'system'                  │
                       │  attention: bool   (pinned, yellow)         │
                       │  pendingCandidates: CapturedSignal[]        │  <- staging buffer
                       └───────────────┬────────────────────────────┘
                                       │
            ASK (read-only)            │            PLAN (mutating)
        ┌──────────────────┐          │        ┌─────────────────────────────┐
        │ read tools only  │          │        │ read tools + write tools     │
        │ no capture-fire  │          │        │ lane classify (w/g/b)        │
        └──────────────────┘          │        │ accumulate into buffer       │
                                       │        └───────────────┬─────────────┘
                                       │                        │ action point (user approves)
                                       │                        ▼
                                       │        ┌─────────────────────────────┐
                                       │        │ Distillation pass (LLM)      │ -> net intent
                                       │        │  -> CapturedSignal[] (b/g)   │
                                       │        └───────────────┬─────────────┘
                                       │                        │
                                       │        ┌───────────────┴───────────────┐
                                       ▼        ▼                               ▼
                          ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────┐
                          │ AppendPreference  │  │ Commit session/   │  │ CONTENT_REPLAN     │
                          │ (chat, b=hard/    │  │ targets + store   │  │ (diff-only apply,  │
                          │  g=soft)          │  │ display diff      │  │  within constraints)│
                          └──────────────────┘  └──────────────────┘  └────────────────────┘
```

The **three artifacts at an action point are independent** and must not be collapsed:
1. **Session/targets state write** (`CommitSessionCommand` / `LockWeeklyTargetsCommand`).
2. **Display diff** persisted for rendering.
3. **Distilled preference event(s)** (`source='chat'`, lane-classified).

---

## 5. Detailed design

### 5.A — Dual-mode interface

- **Mode is explicit state on the conversation**, not inferred. Add `mode: 'plan' | 'ask'` to the `Conversation` aggregate (`conversation.model.ts`). Default for a fresh user-opened chat: TBD product default (recommend `ask`). System-opened reactive chats: `plan`.
- **Tool gating at the registry level.** `AssistantService.handleTurn()` builds the tool set based on `conversation.mode`:
  - `ask`: read tools only. `assistant_turn` may NOT carry `captured` writes or fire pipelines. Enforce by *not registering* write tools and by rejecting a non-empty `captured`/`pipeline` in `decideActions` when mode is `ask` (defense in depth — prompt is not a boundary).
  - `plan`: read + write tools; lane classification active; captures accumulate into the staging buffer (see 5.E).
- **Intent leak in Ask mode (A3).** If a user clearly requests a change in Ask mode, the agent replies with a "switch to Plan mode to make this change" affordance and writes nothing mutating. Optionally records a `gray`/`inferred` candidate but never applies it.
- **Rename.** `source='assistant'` → `source='chat'` (see 5.E). The agent itself (`AssistantService`) now spans both modes; rename to a `conversation`-centric name is desirable but **scoped as a follow-up** to keep this change reviewable (tracked in §13). Mode labels stay user-facing "Plan"/"Ask".

### 5.B — Iterative generation flow

**Step A — Weekly macro-agreement → lock `WeeklyTargets`.**
- New first-class value object `WeeklyTargets` on the program week: `{ sessionCount, totalVolume (per discipline: km for running / volume-load for strength), keyGoals: string[], locked: boolean, lockedAt }`.
- New command `LockWeeklyTargetsCommand` (+ handler) distinct from `CommitWeekCommand`. It writes the immutable targets and transitions the week into "targets-locked, sessions-open".
- Coach proposes the macro summary; user iterates in chat; on the action point, targets lock.

**Step B — Session-by-session micro-agreement.**
- Introduce **per-session commit granularity**. Today `UpsertWeekSessionsCommand` writes the whole week and `CommitWeekCommand` flips the whole week. Add `CommitSessionCommand` (+ handler) that flips a single session `tentative → committed`.
- Coach proposes one tentative session at a time (a single-session variant of `upsert_week_sessions`, or `upsert_week_sessions` constrained to one session id). User iterates; on action point: distill → `CommitSessionCommand` → store display diff → loop to next session until quota filled.

**Step C — Scheduling phase.**
- Becomes a **terminal phase**, triggered only when the quota is fully locked (all sessions committed). Planner reads availability, proposes slots, user confirms, then `UpsertSessionScheduleCommand` + `CalendarSyncService.syncWeek()` push events, and the week enters `locked`.

**Quota enforcement (B7).**
- New guardrail in `coach.guardrails.ts`: `validateAgainstWeeklyTargets(proposedSession, committedSoFar, targets)` returning a violation that the agentic loop bounces back (same mechanism as `validateWeek`). Rejects any proposed session pushing cumulative count/volume past locked `WeeklyTargets`.

**Program Page lock (B9).**
- Backend-enforced `weekState` (or extend program-week status) with a `locked` value. Direct mutation commands on a locked week are rejected; changes must go through a new Plan-mode conversation (5.D). The UI does not enforce this — backend does.

**Button drop (G3 / your B6).**
- Remove the revise/approve button pair from the contract. The only session action is **commit**. The diff (committed-baseline → agreed-new) is computed at commit time and **persisted in the DB** (new lightweight `SessionDiff` record or an embedded `lastDiff` on the session) for the UI to render. `ApprovalCardBuilder` is retained only as the *read-only* renderer of "what changed at this checkpoint", not as an editor.

### 5.C — Strict context management

- **Purpose-labeled prompt blocks.** Refactor `COACH_SYSTEM_PROMPT` and the seed rendering so each block states *why* it is present:
  - Past workouts → "to assess actual fitness level"
  - Performance metrics → "to gauge current capability and pacing"
  - Locked (committed) sessions → "existing load; balance the rest of the week against this"
  - Weekly load proxy → "to prevent overtraining / respect safety bounds"
  - Locked `WeeklyTargets` → "the hard quota you must fill and may not exceed"
- This is primarily a **template refactor** of `coach.prompt.ts` + the `seedMessage` rendering in `SeedContextBuilder`; no new data plumbing beyond `WeeklyTargets` and the distilled-preference read (5.E).
- **Re-seed per Step-B iteration (C2).** Each session proposal re-seeds with current `WeeklyTargets` + sessions committed so far. The agentic loop is single-turn oriented; stale context is the principal risk, so freshness per proposal is required.

### 5.D — Reactive edits

**User-initiated (D1).**
- Editing an already-generated week opens a Plan-mode conversation and runs a **targeted-edit flow** (not the full macro→session→schedule loop).
- The LLM **validates against current constraints** (`validateAgainstWeeklyTargets` + `validateWeek`):
  - If the edit **fits** within constraints → enable a **diff-only pipeline** (`CONTENT_REPLAN` scoped to the changed session).
  - If the edit **violates** constraints → the LLM **explains the constraint** to the user and warns that honoring it may require **reworking the whole week**; only proceeds to a full re-plan with explicit user consent.

**System-initiated (D2).**
- Split by severity:
  - **Safety-critical** adjustments (e.g., injury/illness signal, hard schedule conflict) may **auto-apply** with a notification — `SAFETY_REPLAN` retains an auto path.
  - **Discretionary** content/timing changes (missed workout reshuffle, sync-driven volume tweak) **do not auto-mutate**. They open a **system-originated Plan conversation** and converse before mutating.
- Mechanism: the trigger that previously enqueued the pipeline now (for discretionary cases) creates a conversation with `origin='system'`, `mode='plan'`, `attention=true`, and an auto-generated name prompting the user to read it.

**Yellow-indicator chat (D3).**
- New conversation fields: `origin: 'user' | 'system'`, `attention: boolean`. Surfaced over the existing SSE stream (`GET /assistant/stream`). The conversation is **pinned to the top** with a visible sign and an auto-generated name that tells the user to read it. Approval gate reuses `MessageMeta.awaitingConfirmation`.

### 5.E — Distilled preferences (the core change)

**Kill the heavy revision mechanism.** Remove: `source='revision'`, `RevisionAudit`, `RevisionPhase`, the revision id linkage, `reviseWeek()` / `recordRevisionResults()` / batch-revise variants, `SubmitWeeklyRevisionsCommand` + handler, `RevisionTrigger`, and the seed `buildRevisionRequests` / `buildRevisionHistory` reads.

**Replace with distillation at the action point.**
1. During Plan-mode iteration, captured signals (lane-classified `CapturedSignal[]`) accumulate in the **staging buffer** (`conversation.pendingCandidates`). Retractions during iteration just drop candidates — nothing hits the durable log yet.
2. At the action point (session lock / targets lock), run a **bounded distillation pass** over the local iteration thread: collapse to **net intent** (the pace example: −30s then +15s → net −15s). Emit `CapturedSignal[]` shaped exactly like today's assistant captures.
3. Classify each distilled signal via the **existing lane/confidence axis** — no new field:
   - **black** → `confidence='explicit'` → **hard** structural constraint. Feeds guardrail enforcement (can bounce a future proposal) and the near-term seed window.
   - **gray** → `confidence='inferred'` → **soft** nuance. Bias only; feeds the long-term seed window; never fires.
   - **white** → no capture (pure query).
4. Persist as one batch via `AppendPreferenceEventCommand` (`appendMany`) with `source='chat'`, then `PreferenceIngestionService.ingest()` rebuilds `user_preferences`.

**Confirmation (Q2).** Hard (black) constraints that will constrain all future generation are surfaced for one-tap confirmation using the existing gray→explicit confirm pattern (`clarifyingQuestion` / `awaitingConfirmation`). Soft (gray) signals persist silently.

**Scope (Q3).** Distillation is scoped to the session's modification thread at the action point, but may emit a `global`-scoped preference when the signal clearly generalizes (scope already exists on the event).

**Source taxonomy after the change:**

| source | origin | snapshot? | fires? |
|---|---|---|---|
| `chat` (was `assistant`) | conversation (both modes; mutation only in Plan) | no | only at action point via diff pipeline |
| `outcome` | session execution | n/a | SAFETY_REPLAN |
| `session_flush` | teardown | n/a | WRITE_ONLY |
| ~~`revision`~~ | **removed** | — | — |

**Trade-off accepted:** we lose the tight before/after `revisionId` audit pairing. Preference and the diff it caused are now correlated loosely by conversation/session id + timestamp. The **display diff** (5.B) still gives the user-visible before/after; the **preference event** carries the learned net intent.

**Seed rewire (Q5).** `SeedContextBuilder.buildCoachSeed()` repoints from `buildRevisionRequests`/`buildRevisionHistory` to the distilled preference projection: hard (`explicit`) → near-term/guardrail window; soft (`inferred`) → long-term bias window. `CoachSeed.revisionRequests` / `revisionHistory` fields are replaced by preference-derived fields.

---

## 6. Data-model delta

| Entity | Change |
|---|---|
| `Conversation` (`conversation.model.ts`) | + `mode: 'plan' \| 'ask'`; + `origin: 'user' \| 'system'`; + `attention: boolean`; + `pendingCandidates: CapturedSignal[]` (staging buffer); + auto `name`. |
| Program week | + `WeeklyTargets` value object; + `weekState` including `targets_locked` and `locked`. |
| `PlannedSession` | per-session commit already supported by `PlanState`; + persisted `lastDiff` (or new `SessionDiff` record) for rendering. |
| `PreferenceEventSource` | remove `'revision'`; rename `'assistant'` → `'chat'`. Bump `CURRENT_TAXONOMY_VERSION` 3 → 4. |
| `RevisionAudit`, `RevisionPhase` | removed from `preference-event.model.ts`. |
| `user_preferences` projection | reflect source rename; drop revision-specific projections. |

**Taxonomy version bump (3 → 4):** `findAllForReplay` + the persistence mapper must handle legacy `source='revision'`/`'assistant'` rows on read (map `'assistant'`→`'chat'`; treat legacy `'revision'` as `'chat'` + `explicit`). See §11 migration.

---

## 7. Pipelines & triggers

- **Keep** `CONTENT_REPLAN` as the **diff-apply** pipeline, now triggered by a session commit / targeted edit (5.D), decoupled from preference capture.
- **Remove** `RevisionTrigger`. Replace its enqueue site with the session-commit path.
- **`SAFETY_REPLAN`** keeps an auto-apply path (safety-critical) and gains a "propose-via-conversation" path for discretionary outcomes.
- **`TIMING_REPLACE`** routes through the Step-C scheduling phase / targeted-edit flow.
- **`PROGRAM_GENERATION`** decomposes: `OnboardingGenerationListener` now seeds the program and opens the **Step A** macro conversation instead of generating the whole week in one run.
- **`OrchestratorSaga.run()`** stays the deterministic Coach → Recovery → Planner sequencer; selection remains policy-driven, never an LLM decision.

---

## 8. Removal list (delete, not flag)

- `ApprovalService.reviseWeek()`, `reviseByBatch()`, `recordRevisionResults()`.
- `SubmitWeeklyRevisionsCommand` + `SubmitWeeklyRevisionsHandler`.
- `RevisionTrigger`.
- `RevisionAudit`, `RevisionPhase` (model) + `findRecentRevisions` / `markRevisionsConsumed` (repo port) — or repurpose the latter for nothing (remove).
- `seed/revision-context.ts`: `buildRevisionRequests`, `renderRevisionRequests`, `buildRevisionHistory`, `renderRevisionHistory`, `RevisionRequest`, `RevisionHistoryEntry` (keep `flattenPlannedSession` if still used by the display diff).
- Per-turn eager-fire in `decideActions` for Plan mode (replaced by action-point fire).
- Revise/approve button contract in the approval interface.

**Kept:** `ApprovalService` as the write seam, `ApprovalCardBuilder` as a read-only diff renderer, `approval.policy` (simplified to commit/lock actions), `CalendarSyncService`, `PendingCardBatchService` (re-used for action-point batches).

---

## 9. Frontend contract (what the UI consumes)

- Conversation list shows `attention`/`origin` (pin + yellow sign + auto name).
- A single **commit** action per session; the UI renders the persisted `lastDiff`.
- SSE `GET /assistant/stream` emits: mode, action-point reached, awaiting-confirmation, pipeline progress.
- Program Page reads `weekState`; when `locked`, inline edits are disabled and the UI directs the user to open a Plan conversation.

---

## 10. Phased implementation plan

Each phase compiles and passes tests on its own.

### Phase 0 — Scaffolding & taxonomy (no behavior change)
- Bump `CURRENT_TAXONOMY_VERSION` 3 → 4. Add legacy read-mapping in the persistence mapper (`'assistant'`→`'chat'`, `'revision'`→`'chat'`+`explicit`).
- Add `'chat'` to `PreferenceEventSource` (keep `'revision'`/`'assistant'` temporarily for read compatibility).
- Tests: persistence mapper round-trips legacy rows.

### Phase 1 — Conversation mode + Ask read-only gate
- Add `mode`/`origin`/`attention`/`name`/`pendingCandidates` to `Conversation`.
- Gate tool registration + `decideActions` on mode. Ask = read-only (reject captures/pipeline).
- Tests: `assistant.decision.spec.ts` — ask mode writes nothing/fires nothing; intent-leak affordance.

### Phase 2 — Staging buffer + distillation + `source='chat'`
- Accumulate captures into `pendingCandidates` instead of eager write (Plan mode).
- Implement the distillation pass (bounded `AgenticLoopRuntime.run`) producing net-intent `CapturedSignal[]`.
- Flush at action point via `appendMany` (`source='chat'`), then `ingest()`.
- Hard-constraint confirmation via `awaitingConfirmation`.
- Tests: distillation collapses the pace example to net −15s; black→explicit, gray→inferred; retraction drops candidate.

**Phase 2 as built (status: done) — additive infrastructure, activation deferred.**
The pieces are built and unit-tested; the *behavioral swap* (Plan mode stops eager-writing and starts accumulating) is intentionally deferred to Phase 4, because the action point that flushes the buffer (`CommitSessionCommand` / `LockWeeklyTargetsCommand`) does not exist until Phase 3/4. Flipping eager-fire off now would compile but leave Plan mode unable to apply any change until Phase 4 — so `AssistantService.decideActions` eager-write is unchanged this phase. Delivered:
- `PendingCandidate` neutral type + `pendingCandidates` buffer on the `Conversation` aggregate (domain/schema/repo/port); repo ops `addPendingCandidates` / `clearPendingCandidates`.
- `PreferenceDistillationService` (assistant layer) — bounded LLM net-intent pass, DISTINCT from personalization's projection `DistillationService`; falls back to the raw buffer if the pass yields nothing (intent never lost). Contracts in `preference-distillation.contracts.ts`.
- `CaptureChatPreferencesCommand` + handler (personalization) — ingests a batch with `source='chat'`. `'chat'` added to `AppendPreferenceEventDto` SOURCES.
- `FlushConversationPreferencesCommand` + handler (assistant) — the action-point primitive: read buffer → distil → write chat batch → clear (clear only after the durable write). Phase 3/4 commit/lock handlers dispatch it.
- Shared `signalToPreferenceItem` / `confidenceForLane` mapper (`assistant.mapping.ts`); `decideActions` refactored onto it.
- Tests: `preference-distillation.service.spec.ts` (pace net −15s, black→explicit, gray→inferred, cancel-out → empty, fallback preserves buffer) + `flush-conversation-preferences.handler.spec.ts` (clear-after-write ordering, empty buffer short-circuit, cancel-out clears without writing).
- **Phase 4 will:** map `CapturedSignal`→`PendingCandidate` and call `addPendingCandidates` in Plan-mode capture, remove the per-turn eager-fire, and dispatch `FlushConversationPreferencesCommand` from the lock/commit action points (with the hard-constraint `awaitingConfirmation` gate).

### Phase 3 — `WeeklyTargets` + per-session commit + quota guardrail
- `WeeklyTargets` value object + `LockWeeklyTargetsCommand` + `weekState`.
- `CommitSessionCommand` (per-session flip) + persisted `lastDiff`.
- `validateAgainstWeeklyTargets` guardrail wired into the loop bounce.
- Tests: quota violation bounces; per-session commit; diff persisted.

**Phase 3 as built (status: done) — additive infrastructure; loop wiring deferred to Phase 4.**
The domain/command/guardrail primitives are built and unit-tested. Consistent with the Phase 2 decision, the *guardrail wiring into the coach agentic loop* is deferred to Phase 4, because the per-session proposal tool (Step B) that calls `validateAgainstWeeklyTargets` does not exist until the iterative flow lands. The pure function ships now with tests. Delivered:
- **Program domain:** `WeekState = 'open' | 'targets_locked' | 'locked'` + `WeeklyTargets { sessionCount, totalVolume, keyGoals, lockedAt }`. New `ProgramWeek.weekState` / `weeklyTargets` fields are OPTIONAL with mapper/schema defaults (`'open'` / `null`), so legacy skeleton literals and `updateWeeks` stay valid without a migration.
- `LockWeeklyTargetsCommand` + handler (program) — freezes Step A on one week; targets are immutable (re-locking a `targets_locked`/`locked` week is rejected via `ApiError.badRequest`). Repo `lockWeeklyTargets` does a targeted positional `weeks.$` update.
- `CommitSessionCommand` + handler (planned-sessions) — per-session flip to `committed` plus persisted `SessionDiff` (`lastDiff`, embedded sub-doc, default `null`). Distinct from `CommitWeekCommand`'s whole-week approve.
- `validateAgainstWeeklyTargets(proposed, committedSoFar, targets)` + `sessionVolume` helper (native km / volume-load) in `coach.guardrails.ts` — pure, returns violations for count or volume overshoot (epsilon-tolerant).
- **Phase 4 will:** call `validateAgainstWeeklyTargets` inside the Step-B per-session proposal tool (validator-bounce), and dispatch `LockWeeklyTargetsCommand` / `CommitSessionCommand` from the Step A/B/C action points.

### Phase 4 — Iterative flow wiring (Step A/B/C)
- `OnboardingGenerationListener` opens Step A instead of one-shot week generation.
- Step B loop (re-seed per proposal); Step C scheduling phase gated on quota full → `UpsertSessionScheduleCommand` + `syncWeek()` + week `locked`.
- Purpose-labeled prompt refactor (`coach.prompt.ts` + `seedMessage`).
- Tests: generation produces macro → sessions → schedule; locked week rejects direct mutation.

**Phase 4 as built (status: done) — iterative generation live; per-session re-seed loop simplified.**
The Step-A→B→C ordering is now the real generation path, the quota guardrail is wired into the loop, locked weeks are immutable, and the Plan-mode buffer flushes at the approval action point. Delivered:
- **WS1 — Coach Step A/B + prompt.** New terminal tool `lock_weekly_targets` (Step A) on `CoachService.generateWeeklyTargets` → `LockWeeklyTargetsCommand`. The Step-B `upsert_week_sessions` handler now (a) **rejects a `locked` week** (B9) and (b) applies `validateAgainstWeeklyTargets` **cumulatively** across the proposed sessions when the week's `weeklyTargets` are present (B7, validator-bounce). `coach.prompt.ts` refactored to THREE purpose-labeled operations (SKELETON / STEP A — WEEKLY TARGETS / STEP B — SESSIONS) spelling out the quota the drafts must fit.
- **WS2 — Orchestrator swap.** `runProgramGeneration` is now `skeleton → generateWeeklyTargets (Step A) → generateWeek (Step B) → place`. The macro budget locks BEFORE any session is drafted, so the freshly-locked `weeklyTargets` ride the re-seeded Step-B context (`skeletonWeeks`) and bound the per-session drafting. Everything stays tentative — commit + Google sync still happen later at approval (fail-safe contract unchanged).
- **WS3 — Buffer accumulation + action-point flush.** New `signalToPendingCandidate` mapper. `AssistantService` Plan-mode capture now **stages** the turn's signals into the conversation buffer (`addPendingCandidates`) instead of eager-writing a preference event per turn; white/clarifying/ASK turns stage nothing. The durable write happens once at the **approval action point**: `ApprovalService.approveByBatch` dispatches `FlushConversationPreferencesCommand` (distil → net intent → one `source='chat'` batch → clear) when the batch carries a `conversationId`.
- **WS4 — Locked-week rejection.** Folded into the WS1 `upsert_week_sessions` handler (above).

**Phase 4 simplifications (deferred, by judgment):**
- **Step B is a single quota-aware whole-week write, not a per-session re-seeded micro-loop.** The agentic runtime allows ONE terminal tool per run and there is no "append one tentative session" persistence capability (`replaceTentativeWeek` replaces the whole week). So the per-iteration re-seed loop (C2) + per-session-commit-during-generation (B6) are deferred; `validateAgainstWeeklyTargets` runs cumulatively across the whole proposed week instead, which enforces the same quota.
- **The per-turn pipeline enqueue is RETAINED** as regeneration choreography, decoupled from preference persistence. Removing it (so changes apply only at action points) is coupled to the interactive Step-B / reactive-edit entry point, which is Phase 5 territory; removing it now would leave Plan-mode chat unable to produce a fresh draft. Preference *writes* moved eager→staged+flushed; pipeline *firing* is unchanged.
- **Step C remains the existing approval flow** (`approveWeek`: `CommitWeekCommand` + program-week commit + `CalendarSyncService.syncWeek`). A distinct `weekState='locked'` transition + `LockWeekCommand` is not yet wired into the autonomous path; the locked-week *rejection* guard is in place for when it is.

### Phase 5 — Reactive edits
- Targeted-edit flow (constraint explain vs diff-only `CONTENT_REPLAN`).
- System-initiated discretionary → open pinned Plan conversation; safety → auto path retained.
- Tests: in-constraint edit → diff pipeline; violating edit → explanation + consent gate; system conversation pinned/named.

**Phase 5 as built (status: done) — reactive edits wired on existing seams.**
Most of Phase 5's machinery already existed (constraint validators from Phase 3/4, the `CONTENT_REPLAN` diff pipeline, the `clarifyingQuestion`/`awaitingConfirmation` consent mechanism, and the `origin`/`attention`/`mode` conversation fields from Phase 1). Phase 5 connected them. Delivered:
- **WS1 (D2 + D3) — System-originated discretionary conversation.** `StartConversationCommand` gained an `opts` arg (`{ mode, origin, attention }`) threaded through its handler to `createConversation`. `OutcomeClarifyListener` (the non-safety outcome path) now opens its conversation as `origin='system'`, `mode='plan'`, `attention=true` with an auto-generated, action-prompting **name** (e.g. "Missed session — let's adjust your week") so the UI pins + flags it (yellow-indicator chat). The safety auto-path is unchanged: `OutcomeTrigger` still fires `SAFETY_REPLAN` immediately for injury/illness; only discretionary outcomes converse first. Tests: handler threads opts; listener opens a system+attention+plan conversation, posts the `awaitingConfirmation` question, names a missed-session chat distinctly, and never throws.
- **WS2 (D1) — Targeted-edit constraint explain + consent.** New "CONSTRAINT CHECK" block in `ASSISTANT_SYSTEM_PROMPT`: in Plan mode, before treating an explicit edit to the current week as done, the assistant checks it against the seed's locked `WeeklyTargets` + hard health constraints. Fits → normal BLACK capture → scoped diff-only `CONTENT_REPLAN`. Breaches → EXPLAIN the specific conflict, warn it may require reworking the whole week, and gate on `clarifyingQuestion` (writes nothing) until the user confirms. Rides the existing gray→confirm consent seam; safety signals are explicitly exempt.

**Phase 5 boundary notes (by judgment):**
- **D1's consent gate is prompt-driven, not a new deterministic seam.** The assistant emits `CapturedSignal[]` (preferences), not concrete session edits with volumes, so there is nothing to validate deterministically at decision time; the locked guardrails live in the seed and the LLM reasons over them. The deterministic backstop remains: a constraint-breaching edit that slips through still bounces at the Coach's `upsert_week_sessions` validator (Phase 4). Hence no `assistant.decision` change and the gate is integration-tested rather than unit-tested.
- **Discretionary auto-mutation was already absent.** The only outcome auto-path was injury/illness → `SAFETY_REPLAN` (kept). `FetchTrigger`'s `FULL_SESSION_DAY` produces a *tentative* draft for approval, not an auto-mutation, so it needed no change.

### Phase 6 — Seed rewire + removals
- Repoint `buildCoachSeed()` to distilled preferences (hard→near-term, soft→long-term).
- Delete the removal list (§8). Drop legacy `'revision'`/`'assistant'` once migration (§11) is done.
- Tests: seed renders preference-derived windows; full suite green after deletions.

**Phase 6 as built (status: done) — seed repointed to preference windows; revision mechanism deleted.**
The Coach seed no longer re-joins verbatim revision history to sessions; it reads a distilled preference projection split by confidence. The retired revision machinery is deleted outright (not flagged), and the source taxonomy is collapsed to the live three. Delivered:
- **WS-A — Seed rewire.** New `seed/preference-context.ts` replaces `seed/revision-context.ts`. `buildPreferenceWindows(events)` dedupes by id, drops narrative-only empty `other` events, and partitions by `tag.confidence`: `explicit`→`nearTerm` (hard guardrails for the week being built), `inferred`→`longTerm` (soft long-term bias). `renderPreferenceWindows` emits a "Hard preferences (EXPLICIT — honour as guardrails)" + "Soft preferences (INFERRED — never an override)" block, or `null` when both windows are empty. `SeedContextBuilder.buildCoachSeed` now feeds `[...activeOneOffs, ...recentStandingEvents]` into the windows; `CoachSeed.revisionRequests`/`revisionHistory` are replaced by `preferenceWindows`.
- **WS-B — Approval service.** Deleted `reviseWeek()`, `reviseByBatch()`, `recordRevisionResults()`, the `CardRevisionEdit` interface, and the `RevisionTrigger` constructor dependency (now 4 ctor args). The `MarkRevisionsConsumed` dispatch is gone from `approveWeek`. `approval.policy` drops the `'revise'` action (now `'approve' | 'reject'`).
- **WS-C — Interface.** Removed `POST :batchId/revise` + `ReviseCardsDto`. The card surface is commit-only (approve/reject); targeted changes flow through Plan-mode conversation.
- **WS-D — Commands/triggers deleted.** `SubmitWeeklyRevisionsCommand`+handler+DTO, `MarkRevisionsConsumedCommand`+handler, `RevisionTrigger` — files removed; handler arrays + module providers/exports pruned.
- **WS-E — Domain/repo.** Deleted `RevisionAudit`/`RevisionPhase`, the `revision` field on `PreferenceEvent`, `findRecentRevisions`/`markRevisionsConsumed` (port + impl), `recentRevisions` from `GenerationContext` + `context-builder`, and `recentRevisionLimit` from config.
- **WS-F — Source taxonomy.** `PreferenceEventSource` is now `'chat' | 'outcome' | 'session_flush'`. Legacy producers (`seed-personalization`, `create-training-profile`, `capture-assistant-preference`) ingest `'chat'`. `normalizeLegacySource` maps persisted `'revision'`/`'assistant'` rows → `'chat'` on read (applied in `toDomain`); the Mongoose write-enum keeps the legacy values so lean reads of historical rows don't trip validation.
- **WS-G — `/personalization/revisions` removed**; `capturePreference` (`/preferences`) kept, ingesting `'chat'`.
- **WS-H — Tests.** New `preference-context.spec.ts` (confidence partition, dedupe, empty-`other` drop, render sections + null). Revision specs deleted or rewritten; `preference-event.persistence-mapper.spec.ts` asserts the legacy→`chat` mapping; full suite green (44 suites / 242 tests).

**Phase 6 boundary note (by judgment):**
- **The §8 "per-turn eager-fire in `decideActions`" item is partially resolved, consistent with the Phase 4/5 notes.** The eager *write* per turn was already removed in Phase 4 (WS3): Plan-mode capture stages into the conversation buffer and the durable `source='chat'` write happens once at the approval action point. The per-turn pipeline *fire* (`queue.enqueue` when `actions.pipeline` is set) is **retained** as regeneration choreography — it is the only entry point that lets a Plan-mode turn produce a fresh tentative draft, since the interactive per-session re-seed loop (Phase 4 simplification) was never built. Removing it now would leave Plan-mode chat unable to generate a draft. The §8 *intent* (preference persistence no longer fires per turn) is satisfied; the pipeline-firing choreography stays until/unless a per-session reactive-edit entry point replaces it.

---

## 11. Migration

- **Preference rows:** legacy `source='revision'` and `source='assistant'` rows are mapped on read (mapper) until a one-off backfill rewrites them to `'chat'` (revision → `'chat'` + `confidence='explicit'`, dropping the `RevisionAudit` payload). Backfill script under `scripts/`.
- **In-flight tentative weeks / pending card batches:** drained under the old approval path before deploy, or migrated to the new commit/lock model. Confirm none are mid-revision at cutover.
- **Taxonomy version:** consumers keyed on version 3 must tolerate 4.

## 12. Testing strategy

- **Unit:** `assistant.decision.spec.ts` (mode gating), distillation net-intent, `coach.guardrails` quota validator, persistence mapper legacy mapping.
- **Integration:** full Step A→B→C generation; targeted edit in/out of constraints; system-initiated conversation creation.
- **Regression:** existing `agentic-loop.runtime.spec.ts`, `coach.guardrails.spec.ts` stay green.
- **No DB mocks** for persistence-mapper / projection tests (hit the real store per existing convention).

## 13. Explicitly deferred / open

- **ACWR (acute:chronic).** Use load proxy now; build rolling 4-week trailing aggregate later (N1).
- **Agent rename** `AssistantService` → `conversation`-centric name: cosmetic, follow-up to keep this PR reviewable.
- **Default mode** for a fresh user-opened chat (recommend `ask`) — product decision.
- **`SessionDiff` storage shape** (embedded `lastDiff` vs separate record) — RESOLVED in Phase 3: embedded `lastDiff` sub-doc on the planned session (one diff per session, replaced each commit), not a separate history record.
- **Distillation model/temperature** and its prompt — tune in Phase 2.

---

## 14. Decision log (frozen)

| # | Decision |
|---|---|
| A1 | Explicit Plan/Ask toggle; mutation never inferred. |
| A2 | Ask = registry-level read-only. |
| A3 | Intent leak in Ask → switch-to-Plan affordance, no mutation. |
| B4 | `WeeklyTargets` is first-class, immutable once locked. |
| B5 | `LockWeeklyTargetsCommand` distinct from `CommitWeekCommand`. |
| B6 | Per-session atomic commit (`CommitSessionCommand`); drop revise/approve buttons; commit-only + persisted display diff. |
| B7 | Quota guardrail bounces over-budget proposals. |
| B8 | Scheduling is a terminal phase after quota locked. |
| B9 | Backend-enforced Program Page lock. |
| C1 | Purpose-labeled prompt blocks (template refactor). |
| C2 | Re-seed per Step-B iteration. |
| C3 | Defer ACWR; use load proxy. |
| D1 | Targeted-edit flow; constraint-explain vs diff-only pipeline. |
| D2 | Safety auto-applies; discretionary opens a Plan conversation. |
| D3 | Pinned, auto-named, yellow system conversation over SSE. |
| E | Kill heavy revision mechanism; distill net intent at action point → `source='chat'`, classified hard(black)/soft(gray) via lane+confidence. |
| F1 | `ApprovalService` kept as write seam; card UI retired as editor, kept as read-only diff renderer. |
| F2 | `awaitingConfirmation` is the universal approval primitive. |
