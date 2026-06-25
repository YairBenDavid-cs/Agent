# PR Review — Best-Practices Rubric

The standard a senior engineer reviews against. Each sub-agent owns a subset of these sections (see the table in SKILL.md). Apply the principles the change actually touches — name the file, the line, the principle, and a fix for every finding.

## 1. Core Philosophy

- **The real goal** — Don't just make it work; make it clear, safe, maintainable, and hard to misuse.
- **Code is read 10× more than written** — Optimize for the next reader, who is usually you in six months.

## 2. SOLID

- **Single Responsibility (SRP)** — One module, one reason to change.
- **Open/Closed (OCP)** — Open for extension, closed for modification: add behavior without editing tested code.
- **Liskov Substitution (LSP)** — Any subclass must slot in for its parent without breaking callers.
- **Interface Segregation (ISP)** — Small, specific interfaces; nobody depends on methods they don't use.
- **Dependency Inversion (DIP)** — High-level and low-level code both depend on abstractions, never on concretes.

## 3. Architecture & Domain

- **Point dependencies inward** — Core business rules know nothing about DBs, UIs, or frameworks.
- **Scream the architecture** — Organize folders by business feature, not by technical role.
- **Speak the Ubiquitous Language** — Variables, classes, and tables match the words the business actually uses.
- **Define Bounded Contexts** — Isolate domains so a concept in one doesn't leak into another.
- **Favor composition over inheritance** — Give objects capabilities ("has-a"), avoid brittle "is-a" trees.
- **Use the Strategy pattern** — Swap interchangeable algorithms at runtime instead of growing switch statements.

## 4. The DDD / Orchestrator Architecture (Target Model)

- **Entity is a leaf** — Each domain entity owns exactly one repository, and is the only code that talks to it.
- **Cross-module logic becomes an orchestrator** — If a flow or controller needs more than one module, it doesn't reach across; it becomes an orchestrator that calls each module's service, applies the coordinating logic, and returns the result.
- **Orchestrators can nest** — An orchestrator may orchestrate other orchestrators, all the way up.
- **One responsibility per level** — Entity → owns data. Service → owns domain rules. Orchestrator → coordinates, never decides. Each layer does one job.
- **Extend, don't edit** — New flows are added by composing new orchestrators/strategies, not by rewriting existing tested code (OCP applied at the architecture level).
- **Caution** — An "orchestrator of orchestrators" is where god-objects sneak back in. Keep every orchestrator thin and decision-free, or the responsibility boundary collapses.

## 5. Code Craft

- **Make intent obvious** — If the name needs a comment, the name is wrong.
- **Prefer simple code** — Every abstraction is a debt; make it earn the interest. Inline when inlining is clearer.
- **Do one thing** — Small, single-task functions, free of hidden side effects.
- **Make side effects obvious** — API calls, state writes, I/O, events: never a surprise.
- **Comment only the why** — Code shows what; comments explain why, tradeoffs, and business rules. Treat a needed explanatory comment as a smell to refactor away.
- **Sniff out code smells** — Hunt God classes, giant methods, primitive obsession, and refactor them.
- **Boy Scout rule** — Leave every file a little cleaner than you found it.
- **Fix broken windows** — Kill bad hacks and failing tests immediately, before the rot spreads.
- **Refactor with safety nets** — Never change internal structure without tests guarding external behavior.
- **Shoot tracer bullets** — Build a thin end-to-end skeleton first, then flesh it out.
- **Remove redundant code** — Dead code isn't neutral; it lies to the next reader.

## 6. State, Data & Ownership

- **One source of truth (DRY)** — Every fact, type, constant, and contract lives in exactly one place.
- **Make ownership clear** — For every piece of data: who owns, creates, updates, and ends its lifecycle?

## 7. Frontend

- **Predictable state** — One concept, one owner; `useReducer` only when `useState` hurts.
- **Handle async carefully** — Capture values before the world changes (stale state, races, out-of-order responses).
- **Failure is a feature** — Design success, failure, retry, and partial/failed optimistic updates.
- **Preserve user input** — Never make a user retype what your bug erased.
- **Complete the flow** — Save, cancel, empty, invalid, Enter, Escape, blur, failed save — all defined.
- **Keyboard = mouse** — Same action, same code path, regardless of trigger.
- **Optimize UX** — No flicker, no mystery spinners, no input cleared too early.
- **Full optimistic updates** — Fake success only if you own temp state, replacement, rollback, retry, and stale-protection.
- **Build accessibility in** — Keyboard nav, focus, ARIA, alert roles, IME-safe input — a requirement, not a retrofit.

## 8. Backend Layering

- **Clear layers** — Controllers handle HTTP · services hold logic · repositories handle data · orchestrators coordinate. Never tunnel through a layer.
- **Thin controllers** — Parse, delegate, respond — decide nothing.
- **Logic in the right place** — Rules, validation, defaults live in services; orchestrators coordinate, not decide.
- **Filter at the right layer** — Permission/user-specific filtering happens on the server; the client gets only what it needs.
- **No hidden performance costs** — Kill N+1s, repeated lookups, and re-fetches; batch and reuse.

## 9. TypeScript / API Safety

- **Don't trust external data** — TS checks your code, not the network; validate at the boundary.
- **Centralize validation & errors** — One schema, one error shape, schema-derived types.
- **Use TypeScript properly** — `as` and `any` are confessions; prefer narrowing, guards, and schema parsing.

## 10. Operations / Config (12-Factor)

- **Decouple config from code** — Inject secrets, URLs, and env at runtime; never hardcode.
- **Keep processes stateless** — Servers are disposable; persist all state and sessions externally.

## 11. Process

- **Automate standards** — Let ESLint/Prettier/strict mode argue about formatting so humans argue about logic.
- **Treat PRs as artifacts** — What changed, why, where to review, what could break.
- **Focused commits** — One logical change per commit: `topic: verb description`.

## 12. Testing

- **Test real behavior** — Test what the user does, not how the function is built.
- **Fail loudly** — A test that can't fail isn't a test.
