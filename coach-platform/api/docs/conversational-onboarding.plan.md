# Conversational onboarding / program-build plan

Successor to the dual-mode-revision redesign. Today program generation is a
**silent autonomous pipeline** (`orchestrator.saga.runProgramGeneration`: lock
targets → draft whole week → auto-place) producing one whole-week card batch
reviewed on `/program`. This plan replaces that, **for the first week only**,
with an **assistant-led conversational build**: the coach opens a chat, proposes
week-1 targets, locks them on agreement, drafts and locks sessions one at a time
(cards rendering on `/program` as they commit), then negotiates calendar slots
per session and writes the events.

Decisions were settled in a grilling session; this doc is the frozen output.
Every symbol below is verified against the current `api/` and `frontend/` source.

---

## 0. Resolved decisions (frozen)

| # | Area | Decision |
|---|------|----------|
| 1 | Orchestration | Reuse the existing Coach/Planner primitives + agentic loop + card-batch rails; add a **conversation orchestrator** that invokes them incrementally with HITL gates. No rewrite of generation. |
| 2 | Handoff | Onboarding lands the user **in the chat** (the build conversation), not on `/program`. `/program` becomes the read-only render target. |
| 3 | Who opens it | **Server** creates a plan-mode, `origin='system'` conversation on `TRAINING_PROFILE_CREATED` and writes the opening assistant message. FE just navigates to it. |
| 4 | Targets timing | Run Step A first; embed **proposed (unlocked)** targets in the opening message. It's fine to open the chat immediately and show a "coach is thinking" state while Step A runs. |
| 5 | "Lock" semantics | Targets lock via conversational consent (`open → targets_locked`). Each session is a per-session card the user approves; approval commits it (tentative). |
| 6 | Approval surface | **Per-session in-chat cards** (one at a time), reusing `ChatApproval`. The whole-week `/program` batch is no longer used by the build flow. |
| 7 | Render timing | Commit-on-lock: each approved session persists (tentative) and appears on `/program` immediately. |
| 8 | Calendar slots | After all sessions are locked, the coach proposes real open slots per session (availability ∩ live free/busy) and the user picks/approves. Replaces silent auto-place for this flow. |
| 9 | Calendar write | Write the Google event **per session** on slot-agreement and update that card's `scheduledStartUtc` then. |
| 10 | Mode | Build conversation is **Plan** mode from the start. |
| 11 | Scope | **Week 1 only** is conversational. Later weeks remain autonomous tentative sketches and adapt later. |
| 12 | Resumability | Derive the resume point from program/week state (no separate wizard pointer). Assistant re-greets at the current phase; reuse system-conversation + attention surfacing. |
| 13 | `/program` CTA | Pass a **structured session id + context** and open **Plan** mode, reusing the build conversation if still open, else a new plan chat. |
| 14 | Old path | **Remove** the autonomous onboarding pipeline + whole-week onboarding review. Single failure path in chat. |
| 15 | Mocks | **Backend only.** No FE mock for the multi-turn build; FE mocks stay for static read views. |

---

## 1. The build state machine

A pure resolver computes the current phase from program/week/session state, so a
returning user resumes correctly (decision 12). No new "step pointer" is stored.

| Phase | Derived-from condition | Coach/Planner action this turn |
|-------|------------------------|--------------------------------|
| `PROPOSE_TARGETS` | week `weekState='open'` AND no `weeklyTargets` row | propose targets (no lock), persist as **tentative** (`lockedAt=null`) |
| `AWAIT_TARGETS_CONSENT` | `weekState='open'` AND tentative `weeklyTargets` present | wait for yes / revise; on yes → `lock_weekly_targets` |
| `DRAFT_SESSION` | `weekState='targets_locked'` AND committed sessions < `sessionCount` | draft the **next** session → 1-card batch on the conversation |
| `AWAIT_SESSION_CONSENT` | a pending 1-session card batch exists | wait approve / adjust; approve commits that session |
| `PROPOSE_SLOTS` | sessions committed == `sessionCount` AND ≥1 session has no calendar event | propose slots for the next unscheduled session |
| `AWAIT_SLOT_CONSENT` | a slot proposal is outstanding | wait pick; on pick → write event + set `scheduledStartUtc` |
| `COMPLETE` | all sessions scheduled | flip `weekState='locked'`, wrap-up message |

Resolver is a pure function `resolveBuildPhase(program, week, sessions, pendingBatch)`; the orchestrator routes on its output.

---

## 2. Backend workstreams

### BW0 — Build-conversation tagging + orchestrator skeleton (no behaviour change)
- **Conversation metadata**: add `purpose: 'program_build' | null` + `buildContext: { programId, weekIndex } | null` to `conversation.model.ts` (+ schema, repo mapper, response DTO). Set by `StartConversationCommand` opts.
- **`BuildPhaseResolver`** (new, `agents/build/`): pure fn per §1. Unit-tested in isolation.
- **`BuildConversationOrchestrator`** (new): given a conversation turn on a `program_build` conversation, resolve phase → dispatch. Wired but inert until BW1+.
- Acceptance: resolver spec green; no runtime path changed yet.

### BW1 — Onboarding handoff + targets propose/consent/lock
- **Coach tool split** (`coach.service.ts`): add `proposeWeeklyTargets(...)` that reasons + **writes tentative targets** (`weeklyTargets` with `lockedAt=null`, `weekState` stays `open`) via a non-terminal `propose_weekly_targets` tool. Keep `lock_weekly_targets` for the consent step (`open → targets_locked`, stamps `lockedAt`).
- **`OnboardingGenerationListener`** rewrite: on `TRAINING_PROFILE_CREATED`:
  1. seed program (reuse `seedFromProfile`/`seedProgram`),
  2. `StartConversationCommand(userId, title, { origin:'system', mode:'plan', attention:true, purpose:'program_build', buildContext })` → get `conversationId`,
  3. `AppendMessageCommand` opening assistant message (placeholder "building your week…"),
  4. run `generateProgram` (skeleton) + `proposeWeeklyTargets`, then `AppendMessageCommand` with the proposed targets,
  5. emit the `conversation` SSE event (BE-3).
  - No pipeline enqueue, no whole-week batch.
- **Turn handling**: `AWAIT_TARGETS_CONSENT` → on agreement call `lock_weekly_targets`; on "change X" re-propose. Plan mode means no `intentBlocked`.
- **Submit contract**: `POST /training-profile` (or a dedicated `GET /assistant/conversations/build`) returns the `conversationId` so the FE can navigate straight to it. (Create the conversation synchronously inside the handler path; Step A may finish slightly later → "thinking" state, decision 4.)
- Acceptance: finishing onboarding opens a plan chat whose first real message proposes week-1 targets; "looks good" locks them.

### BW2 — Per-session drafting + per-session card + commit-on-approve
- **Coach tool** (`coach.service.ts`): add `draftNextSession(...)` — drafts exactly **one** session (the next index not yet committed), validated against the **locked** `weeklyTargets` (reuse `coach.guardrails` quota) and the already-committed sessions. Writes it **tentative**.
- **Card batch**: record a **1-session** `PendingCardBatch` with `conversationId` set (reuse `maybeRecordBatch`/`set-pending-card-batch`) → surfaces via the existing `pendingCardBatchId` + `ChatApproval`.
- **Approve** commits that session (per-session commit already exists, Phase 3) and advances to `DRAFT_SESSION` for the next; **reject/adjust** re-drafts.
- Acceptance: the coach walks sessions one at a time; each approved session appears on `/program` immediately (decision 7).

### BW3 — Interactive calendar slot negotiation + per-session write + week lock
- **`Planner.proposeSlots(session)`** (new): compute N candidate UTC slots from recurring availability (`seed-context`) minus **live** busy (`calendar.listEvents`/`fetchBusy`), reusing `planner.prewrite-validator` clash logic. Returns ranked candidates.
- **Slot card / consent**: surface candidates in chat (new lightweight payload on the message meta, or a 1-session "schedule card"). User picks one.
- **`confirmSlot(session, slot)`**: write the Google event (reuse `calendar-sync.service`), set the session's `scheduledStartUtc`, mark scheduled.
- When all sessions scheduled → `weekState='locked'` + wrap-up message.
- Acceptance: per-session slot proposals reflect real free/busy; picking writes a calendar event and updates the card; week ends `locked`.

### BW4 — Resumability + failure handling
- On every build-conversation turn (and on load), recompute phase from state; the assistant re-greets at the right phase after a tab close (decision 12). Reuse attention to re-surface.
- Failure path: if a Coach/Planner run aborts (e.g. `OPENAI_NOT_CONFIGURED`), post a chat message ("coach unavailable, try again") with a retry affordance — no silent stall, no second generation system (decision 14).
- Acceptance: closing/reopening resumes mid-build; an aborted step is recoverable from chat.

### BW5 — Remove the old autonomous onboarding path
- Delete the pipeline enqueue + whole-week onboarding batch from the onboarding path. Keep `PROGRAM_GENERATION` for later-week auto-sketches only.
- Remove the `/program` "generating" spinner + whole-week `WeekReview` *for onboarding* (the surface stays for any remaining legacy replan, or is retired if unused).
- Acceptance: no path produces a whole-week onboarding batch; tests updated.

---

## 3. Frontend slices

### FW1 — Onboarding → chat handoff
- `useOnboarding.finish()`: on submit success, read the returned `conversationId` and `navigate('/assistant/:id')` (replace) instead of `/program`. Drop the `fromOnboarding` program state.
- Build conversation auto-opens; the `conversation` SSE push keeps the sidebar in sync (already wired, Slice 4).

### FW2 — Build conversation affordances
- **Thinking state**: show a "coach is building your week…" placeholder/typing indicator while the opening targets message is pending (reuse the workflow SSE progress text already consumed by `useProgram`/`TurnList`).
- **Per-session cards**: already rendered by `ChatApproval` (Slice 2) — verify a 1-session batch renders cleanly and Approve advances.
- **Slot picker**: new affordance — render proposed slots as selectable chips; selecting sends the consent (or calls a confirm endpoint). Mirror the consent-bar pattern from `ConversationView`.

### FW3 — `/program` incremental render
- `useProgram`: ensure tentative sessions appear as they commit (it already reads the calendar range; confirm it refreshes — light poll or reuse the SSE). Remove the onboarding generating-spinner branch.

### FW4 — CTA deep-link upgrade (supersedes Slice 6's text prefill)
- `TrainCard` "Discuss in chat" → pass **structured** `{ sessionId, weekIndex }` via router state and open **Plan** mode; reuse the build conversation id when still open, else start a new plan chat. Backend turn loads full session context from the id (the prefill text becomes a human-readable anchor, not the source of truth).

---

## 4. Ship order & dependencies

```
BW0 ─┬─ BW1 ─┬─ BW2 ─┬─ BW3 ─┬─ BW4 ─┬─ BW5
     │       │       │       │       │
FW1 ─┘   (after BW1) │   FW2 ┘   FW3 ┘   FW4 (after BW2/BW3)
```

1. **BW0** (resolver + tagging, inert) — safe to land first.
2. **BW1 + FW1** — handoff + targets propose/lock (first user-visible slice; happy path to "week targets locked").
3. **BW2 + FW2(cards)** — session-by-session drafting + in-chat approval + `/program` fill-in.
4. **BW3 + FW2(slots)** — interactive scheduling + calendar write + week lock.
5. **BW4 + FW3** — resumability, failure UX, `/program` polish.
6. **BW5 + FW4** — remove old path; CTA structured deep-link.

Each step is independently shippable and leaves the app working.

---

## 5. Risks / open items (track during build)

- **Conversation-id timing** (BW1): if Step A can't finish synchronously, decide between (a) return id immediately + stream the targets message, or (b) brief block. Plan assumes (a) — needs the FE "thinking" state.
- **Tentative-targets persistence**: `weeklyTargets` row must allow `lockedAt=null` (proposed) distinctly from locked — confirm schema/validation accepts it.
- **Per-session draft idempotency**: `draftNextSession` must pick the next *uncommitted* index deterministically so a retry/resume doesn't double-draft.
- **Slot proposal freshness**: free/busy is live; a slot can go stale between propose and confirm — `confirmSlot` must re-validate (reuse prewrite-validator) and re-propose on clash.
- **Phase resolver vs. user going off-script** (e.g. asking an unrelated question mid-build): the orchestrator should answer in plan mode without losing the build phase (phase is state-derived, so it's preserved).
