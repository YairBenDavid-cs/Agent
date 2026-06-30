# Frontend integration plan — dual-mode revision redesign

Companion to `dual-mode-revision-redesign.plan.md`. This is the **contract-first**
wiring plan for the separate Vite frontend: what the FE must build/change to
consume the redesigned backend. Every endpoint, type, and field below is verified
against the current `api/` source.

Decisions were settled in a grilling session; this doc is the frozen output. The
three backend prerequisites it depends on (`ask` default, attention-clear, the
`conversation` SSE event) are **already implemented and tested**.

---

## 0. Resolved decisions (frozen)

| Area | Decision |
|------|----------|
| Default mode | New **user** chats open `ask` (read-only); system chats open `plan`. Server sets this — FE does not `PATCH` on create. |
| Mode toggle | Segmented Plan/Ask pill by the composer, flippable any time, persisted via `PATCH /:id/mode`. |
| Ask intent block | `intentBlocked` → inline "Switch to Plan" affordance (button), not just the appended text. |
| Confirmation | `awaitingConfirmation` → explicit **Approve / Cancel** buttons that send canned messages. |
| Revise | **Removed.** Approve/reject only; a "Discuss in chat" deep-link replaces revise. |
| Approve/reject entry point | **Chat only.** The ProgramPage card surface is read-only display. |
| System-chat discovery | **Push** via the `conversation` SSE event — no polling. |
| Attention | Pin attention-first with a yellow dot; cleared server-side on user reply (FE just refetches). |
| Week lock | Read `weekState`; disable inline edits when `locked`, CTA to chat. |
| WeeklyTargets | Show a compact week-header summary when present. |
| Diff | Show the changed session only (card-batch `changedFields`); no before/after, no per-session `lastDiff`. |
| Message meta | Plumb the full `MessageMeta` through the transcript. |
| Types | Generated typed client (OpenAPI) as the source of truth; hand-mirrored acceptable for this pass, comment each as mirrored from a backend symbol. |
| Mocks | Out of scope — leave the mock layer as-is. |

---

## 1. Type contracts to mirror

Mirror these exactly (verified shapes). Comment each with its backend source file.

```ts
// from agents/conversation/domain/conversation.model.ts
type ConversationStatus = 'active' | 'closed';
type ConversationMode   = 'plan' | 'ask';
type ConversationOrigin = 'user' | 'system';
type MessageRole        = 'user' | 'assistant' | 'system';

interface MessageMeta {
  lane?: 'white' | 'black' | 'gray';
  capturedEventIds?: string[];
  pipelineRunId?: string;
  cardBatchId?: string;
  awaitingConfirmation?: boolean;
  buildRetry?: boolean;                 // §7 — Coach/Planner aborted; render Retry
  slotProposal?: {                      // §7 — outstanding calendar-slot pick
    plannedSessionId: string;
    candidates: Array<{
      scheduledDate: string; startTime: string; endTime: string;
      scheduledStartUtc: string;
    }>;
  };
}

type ConversationPurpose = 'program_build';     // §7; null = ordinary chat
interface BuildContext { programId: string; weekIndex: number }

interface Conversation {
  id: string; userId: string; title: string | null;
  status: ConversationStatus;
  mode: ConversationMode; origin: ConversationOrigin; attention: boolean;
  purpose: ConversationPurpose | null;          // §7 — routes turns to the build
  buildContext: BuildContext | null;            // §7 — program + week being built
  summary: string; summarizedUpToSeq: number; lastSeq: number;
  pendingCardBatchId: string | null;
  pendingCandidates: PendingCandidate[];        // usually ignorable in UI
  createdAt: string; updatedAt: string; closedAt: string | null;
}

interface Message {
  id: string; conversationId: string; userId: string;
  seq: number; role: MessageRole; content: string;
  meta: MessageMeta | null; createdAt: string;
}

// from agents/assistant/assistant.service.ts
interface AssistantTurnOutcome {
  lane: 'white' | 'black' | 'gray';
  reply: string;
  capturedCount: number;
  inferred: boolean;
  awaitingConfirmation: boolean;
  intentBlocked: boolean;            // ASK-mode mutation refused
  pipelineRun: PipelineRunResult | null;
  conversationId: string;            // resolves the id='new' case
  assistantMessageId: string;
}

// from agents/orchestrator/pipeline.types.ts
interface PipelineRunResult {
  pipeline: 'full_session_day'|'safety_replan'|'content_replan'|'timing_replace'|'program_generation'|'write_only';
  status: 'completed' | 'aborted';
  stages: string[];
  recoveryVerdict: unknown | null;
  placement: unknown | null;
  abortReason?: string;
  superseded?: boolean;              // shown card is stale → invalidate
}

// from agents/approval/approval-card.builder.ts + approval.service.ts
type CardDiffStatus = 'new' | 'modified' | 'unchanged' | 'removed';
interface ApprovalCard {
  sessionId: string; slotKey: string; type: string; title: string;
  scheduledDate: string; startTime: string; endTime: string;
  intensityLabel: string; estDurationMin: number;
  coachNotes: string | null; placementNote: string | null;
  diffStatus: CardDiffStatus; changedFields: string[];
}
interface ApprovalBatchView {
  programId: string; weekIndex: number;
  cards: ApprovalCard[];
  allowedActions: ('approve' | 'reject')[];   // authoritative — drive buttons off this
  batchId: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  kind: string; conversationId: string | null;
}
interface ApproveResult { committed: number; calendar: { synced: number; failed: number } }

// from program/domain/program.model.ts (rides through program.weeks[])
type WeekState = 'open' | 'targets_locked' | 'locked';
interface WeeklyTargets {
  sessionCount: number; totalVolume: number; keyGoals: string[]; lockedAt: string;
}
// ProgramWeek now also carries: weekState?: WeekState; weeklyTargets?: WeeklyTargets | null

// from common/errors/api-error.ts — EVERY failure
interface ErrorEnvelope { error: { code: string; message: string; details?: unknown } }
```

---

## 2. Endpoint map

Chat (`/assistant/conversations`):
- `POST /` → `{ conversationId }` — open empty conversation.
- `GET /?cursor&limit` → `Page<Conversation>` (newest first).
- `GET /:id` → `Conversation`.
- `GET /:id/messages?cursor&limit&order=asc|desc` → `Page<Message>`.
- `POST /:id/messages` body `{ message }` → `AssistantTurnOutcome`. **`id='new'` opens implicitly**; read the returned `conversationId`.
- `PATCH /:id` body `{ title }` → `Conversation`.
- `PATCH /:id/mode` body `{ mode }` → `Conversation`.
- `POST /:id/close` → `{ closed: true }` (fires the staging-buffer flush).
- `DELETE /:id` → `{ deleted: true }` (no flush).
- `GET /build` → `{ conversation: Conversation | null }` — the in-flight `program_build` chat (§7).
- `POST /:id/confirm-slot` body `{ scheduledStartUtc }` → `AssistantTurnOutcome` — confirm a slot pick (§7).
- `POST /:id/resume` → `{ outcome: AssistantTurnOutcome | null }` — re-greet an in-flight build on reopen (§7).

Stream:
- `GET /assistant/stream` (SSE) — **multiplexed**, see §3.

Approvals (`/assistant/approvals`):
- `GET /` → `PendingCardBatch[]`.
- `GET /:batchId` → `ApprovalBatchView`.
- `POST /:batchId/approve` → `ApproveResult`.
- `POST /:batchId/reject` → discard result (only when `allowedActions` includes `reject`).

Program:
- `GET /programs/active` → `{ hasProgram, program }`; read `program.weeks[].weekState` / `weeklyTargets`.

Auth precondition: a turn requires an active program. No program → `400` (`COMMON.VALIDATION_FAILED`, message "No active program…") → route to onboarding.

---

## 3. SSE: the stream is now multiplexed ⚠️

`GET /assistant/stream` emits **two event types**; branch on `event.type`:

```ts
// type: 'workflow'  — progress beats
{ agentName, phase, detail?, at }
// type: 'conversation' — a trigger opened a chat for the user (push, no polling)
{ conversationId, title, origin: 'user'|'system', attention, at }
```

- Open **one** app-level `EventSource` after login; auth rides the httpOnly cookie (avoid `?access_token` — it leaks into logs). Reconnect with backoff.
- `workflow` → render "Coach is evaluating…" while a POST turn is in flight.
- `conversation` → invalidate/refetch the conversation list so the new pinned/flagged chat appears immediately (this is the Q8 push path; do **not** poll).

---

## 4. Build slices (ship order)

De-risk by shipping the core loop first. Each slice is independently shippable.

### Slice 1 — Typed client + dead-path cleanup
- Generate/define the typed client (§1) against the live API.
- **Delete the revise UI**: any `reviseBatch`/`CardRevisionEdit`/`'revise'` action and its endpoint call — the route is gone (404). Card buttons must come from `allowedActions`.

### Slice 2 — Plan → fire → card → approve (happy path) ⭐ first
The vertical slice that exercises turn flow, SSE, the card contract, and refetch.
- Composer → `POST /:id/messages`; render the user message optimistically; on the body, append the assistant reply (carry `meta`).
- If `pipelineRun?.status === 'completed'`: refetch the conversation, read `pendingCardBatchId`, fetch `GET /approvals/:batchId`, render the card batch **in chat**.
- Approve/reject buttons from `allowedActions` → `POST .../approve|reject` → invalidate approvals + program queries.
- Handle `pipelineRun.superseded === true` and a non-`pending` batch by replacing the card with a "superseded — here's the latest" state (never error).

### Slice 3 — Mode + consent
- Plan/Ask segmented toggle in the composer → `PATCH /:id/mode`; reflect returned `mode`. New chats arrive `ask` already (server default) — show read-only affordance on first load, composer stays enabled.
- `intentBlocked` → inline "Switch to Plan" button (calls `PATCH /mode`, optionally re-sends the message).
- `awaitingConfirmation` → render the assistant question with **Approve / Cancel** buttons that send canned next messages ("Yes, apply that" / "No, leave it"); the next turn resolves it (no dedicated endpoint).

### Slice 4 — Conversation list: system / attention chats
- Map `origin`/`attention` onto the list item; **sort `attention:true` first**, render a yellow dot.
- Subscribe to the `conversation` SSE event (§3) to surface a newly opened system chat without polling.
- Attention clears server-side on user reply — just refetch the conversation after a turn; no client "mark read".

### Slice 5 — ProgramPage: week lock + targets
- Read `weekState` per week: render a lock badge; when `locked`, **disable inline edits** and show a "Make changes in chat" CTA (opens a Plan conversation). Mirrors the backend's locked-week rejection guard so the UI never provokes a 400.
- When `weeklyTargets` is present, render a compact week header: `"{sessionCount} sessions · {totalVolume} · {keyGoals…}"`.

### Slice 6 — Lifecycle + targeted-edit deep-link
- "End session" action → `POST /:id/close` (fires the flush). Also best-effort on tab close via `visibilitychange` + `sendBeacon`. Never auto-delete.
- "Discuss in chat" / "Adjust" on a card: deep-link to the batch's `conversationId` (or open a Plan chat) and **prefill the composer** with a session reference (e.g. "About my Tue tempo run…"). No backend change — the turn already loads full program context server-side; the prefill is just the LLM's anchor.

---

## 5. Cross-cutting

- **Error handling.** One fetch interceptor on the `ErrorEnvelope` (§1): branch on `error.code`; render `details[]` as field errors for `COMMON.VALIDATION_FAILED`; special-case the "no active program" 400 → onboarding redirect; `COMMON.INTERNAL` → generic toast.
- **Cache invalidation.** After any turn or approval action, invalidate: the conversation, its messages, the approvals list, and `programs/active`. The `superseded` flag and non-`pending` batch status are the staleness signals.
- **Optimistic UX.** User message + `id='new'` swap are the two optimistic spots; reconcile to `outcome.conversationId` / `outcome.assistantMessageId` on the body.

---

## 6. Backend prerequisites — status

All three implemented + tested (`api/`), so the contracts above are stable:
1. **`ask` default** for user-origin conversations (`conversation.repository.ts`).
2. **Attention-clear** on user reply, atomic in `appendMessage`.
3. **`conversation` SSE event** emitted by `OutcomeClarifyListener`, multiplexed on `GET /assistant/stream`.

No further backend work is required for this frontend pass.

---

## 7. Conversational program-build (BW1–BW5) — FE contract

A new server-led flow: on **onboarding finish** the backend seeds a minimal program
and opens a `program_build`, plan-mode conversation, then the coach walks the user
through building week 1 turn-by-turn (propose targets → lock → draft each session →
schedule it on the calendar → lock the week). This is a normal conversation with
extra `meta` on some turns plus two purpose-specific endpoints. **No FE mock for the
multi-turn build** (decision 15) — wire it against the live API. The static read
views (program cards) keep their existing mocks.

### 7.1 New / extended types

```ts
// agents/conversation/domain/conversation.model.ts
type ConversationPurpose = 'program_build';   // null = ordinary chat

interface BuildContext { programId: string; weekIndex: number }

// Conversation gains:
//   purpose: ConversationPurpose | null;
//   buildContext: BuildContext | null;

// MessageMeta gains TWO build fields (plumb through the transcript):
interface MessageMeta {
  // …existing: lane, capturedEventIds, pipelineRunId, cardBatchId, awaitingConfirmation
  buildRetry?: boolean;                 // the Coach/Planner run aborted → render a Retry affordance
  slotProposal?: {                      // an outstanding calendar-slot pick for ONE session
    plannedSessionId: string;
    candidates: Array<{
      scheduledDate: string;            // 'YYYY-MM-DD'
      startTime: string;                // 'HH:mm'
      endTime: string;                  // 'HH:mm'
      scheduledStartUtc: string;        // ISO instant — echo this back to confirm
    }>;
  };
}
```

### 7.2 New endpoints

- `GET /assistant/conversations/build` → `{ conversation: Conversation | null }`
  The in-flight build chat the onboarding handoff opened, or `null`. **The FE polls
  this once after onboarding finish** to discover the conversation id and navigate
  into it. (Route is declared above `:id`, so `"build"` is never a conversation id.)
- `POST /assistant/conversations/:id/confirm-slot` body `{ scheduledStartUtc }` →
  `AssistantTurnOutcome`. Confirms the user's slot pick from the latest
  `slotProposal`. Server re-validates against the live calendar, writes the schedule
  + creates the Google event, then advances the build (proposes the next session's
  slots, or posts the completion message). Echo back the exact `scheduledStartUtc`
  of the chosen candidate.
- `POST /assistant/conversations/:id/resume` → `{ outcome: AssistantTurnOutcome | null }`.
  Call on **reopen** of a `program_build` chat. The server derives the live phase
  from state: if the build sits on an unperformed step (e.g. an aborted kickoff),
  it re-greets and returns an `outcome`; otherwise `outcome` is `null` and you just
  render the existing transcript.

### 7.3 FW1 — Onboarding handoff

- `useOnboarding.finish()` no longer waits on a generation spinner. After finish,
  poll `GET /assistant/conversations/build` until `conversation !== null`, then
  navigate to `/assistant/:conversationId`. (The build chat is opened by a backend
  listener on the training-profile event; there is no synchronous body to read.)
- Remove the old "generating your program…" blocking spinner on the onboarding
  finish screen — generation no longer runs there.

### 7.4 FW2 — Build conversation UI

The build is a normal transcript; render these `meta`-driven affordances on top:
- **Thinking state**: while a build turn (`POST /:id/messages`, `/confirm-slot`,
  `/resume`) is in flight, show "Coach is building…" (reuse the `workflow` SSE
  beats from §3 if present).
- **Per-session cards**: a drafted session lands as a normal `pipelineRun` +
  `pendingCardBatchId`; fetch + render the card batch in chat exactly like §Slice 2
  (Approve/reject from `allowedActions`). The user approves sessions one at a time.
- **Slot picker**: when an assistant turn carries `meta.slotProposal`, render its
  `candidates` as selectable chips (label each from `scheduledDate`+`startTime`–
  `endTime`). On pick → `POST /:id/confirm-slot` with the chosen
  `scheduledStartUtc`. The reply may carry the next session's `slotProposal` (loop)
  or the build-complete message (done). Only the latest unscheduled proposal is
  live; once that session has a calendar event the chips are spent.
- **Consent gates**: targets/session approval surface as `awaitingConfirmation`
  (§Slice 3 Approve/Cancel canned-message pattern). No new endpoint.
- **Retry**: a turn with `meta.buildRetry === true` means the Coach/Planner backend
  aborted. Render a **Retry** button — any user reply (or a `POST /:id/resume`)
  re-runs the same phase idempotently. The chat never silently stalls.

### 7.5 FW3 — ProgramPage incremental render

- As each build session is approved + scheduled, it appears in `program.weeks[]`.
  Make `/program` re-render incrementally (invalidate `programs/active` after every
  approve and every `confirm-slot`) so cards fill in one-by-one during the build.
- Remove the onboarding-era full-program spinner — there is no single generation
  moment to wait on anymore.

### 7.6 FW4 — "Discuss in chat" deep-link + resume

- TrainCard "Discuss in chat" deep-links into the relevant chat in **Plan** mode and
  prefills a structured session reference (`{ sessionId, weekIndex }` → composer
  anchor text). Reuses §Slice 6; no backend change.
- On navigating into any `program_build` conversation (`purpose === 'program_build'`),
  call `POST /:id/resume` once after loading the transcript, and append `outcome`
  if non-null. This is how an interrupted build re-greets the user at its current
  phase (decision 12 — resume point is derived from state, free).
```
