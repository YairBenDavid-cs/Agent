# Coach Platform — 10-minute demo talk script

*Slides 1–10 → ~9:00, then live demo. Speaker notes on each slide carry the same timings.*

---

**0:00 – 0:45 · Slide 1 — Title.**
"Everyone here has started a training plan that fell apart by week two. Not because the plan was bad — because it couldn't listen. I built Coach Platform: not one chatbot, but a coaching *team* — a Coach, a Recovery Guru, a Planner, and an Assistant — that remembers what you tell it, adapts to what your body says, and has hard limits it will not cross."

**0:45 – 1:30 · Slide 2 — The problem.**
"Generic plans fail three ways: they forget ('no burpees' lasts one session), they ignore your body (bad sleep, the PDF doesn't care), and they have no guardrails (ask nicely, volume jumps 40%). My bet: fix memory, adaptation, and safety — and the plan survives contact with real life."

**1:30 – 2:15 · Slide 3 — Demo map.**
One sentence per card: "You'll see onboarding create your first week; plan mode propose edits you approve; auto mode where agents debate and commit alone; Garmin data triggering an unasked re-plan; and the scheduled build that drafts next week onto your calendar."

**2:15 – 3:00 · Slide 4 — Architecture.**
"React front end, NestJS API, MongoDB, a Python service for Garmin, Google Calendar for output. The key line is the bottom one: LLM calls live only inside the four agents. The orchestrator that decides who runs next is a routing table — deterministic code, never an LLM improvising."

**3:00 – 4:15 · Slide 5 — Memory (OpenClaw).**
"Concept one: memory it can defend. Every signal lands in an append-only event log; a deterministic distill step replays it into current truth. Three properties: evidence before belief (an inferred dislike needs 3 strikes before it changes anything), memory that fades (inferred prefs decay in 90 days, explicit orders don't), and provenance (ask 'why no burpees?' — it cites the exact events). Delete the projection, replay the log, it rebuilds identically."

**4:15 – 5:15 · Slide 6 — Three modes.**
"Concept two: permissions. Ask is read-only — edits blocked in code, not by a polite prompt. Plan proposes diffs you approve. Auto acts alone but audits everything. Same agent code in all three — only the write permission changes. And safety overrides every gate: an injury signal re-plans conservatively in all modes."

**5:15 – 6:15 · Slide 7 — The debate.**
"What you'll watch in auto mode: Recovery reads sleep, HRV, and load and issues a readiness verdict. Coach drafts inside that band. Recovery re-checks the actual draft. On disagreement, the *safer* verdict wins — max 2 rounds. Agents never chat; they write typed state a router hands to the next one. And Recovery never sees your goal — ambition can't bias readiness."

**6:15 – 7:15 · Slide 8 — Garmin sync.**
"You finish a run, don't open the app. A cron sweep fetches your day; a content hash means an unchanged day costs zero writes. A significance gate asks 'does this matter?' — only then does a re-plan run, ending as a tentative diff card in chat. Idempotency keys make it exactly-once by construction."

**7:15 – 8:15 · Slide 9 — Next-week build.**
"The weekly heartbeat, guardrails in order: targets locked *first* so nothing can inflate the budget; sessions drafted within it (red readiness = zero hard sessions); the full week validated — max +10% load vs last week; then the Planner books clash-free, app-owned calendar slots. It all ends as one per-session diff card."

**8:15 – 9:00 · Slide 10 — Thesis.**
"One line to remember: LLMs propose, deterministic code decides. Typed exits only, tentative until approved, everything audited. Now let's watch it run."

**9:00 → · Live demo** — onboarding → plan mode → auto mode → Garmin sync → next-week build.

*Backup: if the demo fails, the HTML walkthrough (coach-platform-explained.html) has every flow as a diagram.*
