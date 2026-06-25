# Backend Engineering Standards — NestJS + MongoDB + CQRS/DDD

Mandatory rules for all backend code. Framework-agnostic of any single feature. Stack: NestJS · MongoDB (Mongoose) · CQRS (@nestjs/cqrs) · DDD with orchestrators. Frontend is React + TypeScript (out of scope here, but contracts must serve it). Write code for the next reader: clear, safe, hard to misuse. Code is read far more than written.

## 1. Architecture (DDD + CQRS + Orchestrators)

- Organize by bounded context / feature, never by technical layer at the top level. Folders scream the domain (`<feature>/`, e.g. `orders/`, `users/`), not the framework.
- Inside each context, dependencies point inward: interface → application → domain, with infrastructure implementing domain ports. The domain depends on nothing external (no Nest, no Mongoose, no HTTP).
- Layer responsibilities — each does exactly one job:
  - `domain/` — entities, value objects, domain events, repository ports (interfaces), domain services, invariants. Pure, framework-free, deterministic.
  - `application/` — commands, queries, their handlers, orchestrators, sagas, DTOs in/out, mappers. Owns use-cases.
  - `infrastructure/` — Mongoose schemas, repository implementations, persistence mappers, external clients, config.
  - `interface/` — controllers, request/response DTOs, guards, pipes, HTTP concerns only.
- CQRS split is strict: commands mutate state and return nothing meaningful (or an id); queries read and never mutate. Never mix read and write in one handler. Use separate read models when read shapes diverge from write models.
- Command/Query handler = the entry point for a use-case. It validates intent, loads aggregates via ports, applies domain logic, persists, dispatches domain events.
- Orchestrator = coordinates multiple modules/services when a flow crosses bounded contexts. It calls each module's service/handler, sequences them, and returns the result. It coordinates, never decides — no business rules live in an orchestrator. Keep it thin.
- Orchestrators may nest (orchestrator of orchestrators), but this is where god-objects creep in: every level stays decision-free and single-purpose, or the boundary has already collapsed.
- Saga = reacts to domain events for long-running / cross-aggregate flows (eventual consistency, compensations). Use a saga, not an orchestrator, when the trigger is an event rather than a direct call.
- One responsibility per level: Entity owns data + invariants → Service/Handler owns domain rules → Orchestrator coordinates → Saga reacts. Never tunnel through a layer.
- Extend, don't edit: add new flows by composing new handlers/orchestrators/strategies, not by rewriting tested code (Open/Closed at the architecture level).
- Each domain entity/aggregate owns exactly one repository, and is the only code that talks to it. No cross-aggregate repository access.
- Define and respect bounded contexts: a concept in one context must not leak into another. Cross-context communication goes through published contracts/events, not shared internals.
- Speak the ubiquitous language: classes, variables, collections, and events use the words the business uses.

## 2. SOLID & Design

- **SRP** — one module, one reason to change. Split god classes and giant methods on sight.
- **OCP** — open to extension, closed to modification; add behavior without touching tested code.
- **LSP** — any implementation must substitute for its interface without surprising callers.
- **ISP** — small, specific interfaces; depend only on methods you use.
- **DIP** — high-level and low-level code both depend on abstractions. Controllers/services depend on repository interfaces, never concrete Mongoose models.
- Favor composition over inheritance ("has-a" over brittle "is-a" trees).
- Use the Strategy pattern to swap interchangeable algorithms at runtime instead of growing switch/if chains.
- DRY — every fact, type, constant, and contract lives in exactly one place. Reuse shared domain types across handlers and contracts.

## 3. NestJS Module & DI Conventions

- Structure by feature module: one `*.module.ts` is the boundary of each context, declaring its controllers and providers explicitly (no magic scanning).
- A module is the source of truth for its domain. Private by default: a provider is internal unless intentionally `export`ed. Exports are the module's public contract.
- A module that needs another domain imports that domain's module directly — never reaches through a third module or a shared "god/common" module.
- Prefer many small, single-responsibility providers over one bloated service.
- DI rules: mark managed classes `@Injectable()`; constructor injection only; inject by type/abstraction; never `new` a service manually.
- Treat services as singletons (one shared instance per module scope): no per-request mutable state.
- Scaffold with the Nest CLI (`nest g ...`); don't hand-roll boilerplate.
- Naming: `<Feature>Module`, `<Feature>Controller`, `<Feature>Service`, files `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts`. No abbreviations, no vague names. Keep files short and readable.

## 4. HTTP Layer (Controllers, DTOs, Validation)

- Thin controllers: parse input → delegate to a command/query (or orchestrator) → map result to a response. They decide nothing.
- Resource-oriented, RESTful routes: plural collection paths, singular-with-id for one resource. Stable, opaque ids in URLs. Keep routes shallow; nest only when a child strictly belongs to one parent.
- Use HTTP methods semantically: GET read (safe, idempotent), POST create, PUT full replace, PATCH partial update, DELETE remove.
- Separate inputs by role: path params = identity, query params = filter/sort/paginate/options, body = payload. Never put identity in query or large/structured data in path/query.
- Use Nest parameter decorators (`@Param`, `@Query`, `@Body`, `@Headers`) — never touch the raw `req`/`res` for input.
- DTOs are contracts, independent of DB and ORM. Separate DTOs per use-case (`Create…Dto`, `Update…Dto`, response DTOs); no "god DTO". DTOs hold shape only — no logic, no persistence concerns. Keep them in a `dto/` folder per feature.
- Use DTO classes (not interfaces) so Nest can validate at runtime. Put all validation on DTO fields with `class-validator` decorators (type, presence, length, format, enum). No ad-hoc checks in controllers.
- Enable a global `ValidationPipe` once in `main.ts` (`whitelist`, `forbidNonWhitelisted`, `transform`). Controllers then assume validated input.
- Server-generated fields (ids, timestamps) never appear in create bodies.
- Return JSON via plain objects (rely on Nest auto-serialization). Set status codes precisely: 200 read, 201 created, 204 no body. Use `@HttpCode()` only to override deliberately.
- Return complete, normalized resources from writes, not bare status.
- Wrap collections in an envelope (e.g. `{ items, nextCursor }`) rather than a bare array, for forward compatibility. Include pagination fields from day one.

## 5. Persistence (MongoDB + Mongoose)

- The repository port lives in the domain (an interface around domain operations, not low-level storage ops). The Mongoose implementation lives in infrastructure. Controllers/services/handlers depend only on the port.
- Only the repository talks to the Mongoose model/DB. No business rules and no HTTP knowledge in repositories; no DB calls in services/controllers.
- All repository operations are async (return Promises), so storage can change without touching callers.
- Configure the connection with `MongooseModule.forRootAsync` reading `MONGO_URL` from config; use `MongooseModule.forFeature` per feature module to register its models. Self-contained modules.
- Schema rules: explicit type for every field; `required` only when always present; `default` for optional auto-fill; built-in validators (`minlength`, `maxlength`, `min`, `max`, `enum`) over manual checks. Schemas live in the data layer and hold no business logic.
- Use `{ timestamps: true }` instead of hand-rolled `createdAt`/`updatedAt`.
- Use `Types.ObjectId` for relationship fields, always paired with a correct `ref`. Treat ObjectIds as backend identity; convert to strings only at the DTO boundary.
- Modeling by access pattern, not aesthetics. Design from real read/write flows; optimize the common reads.
- Embed small, bounded, tightly-coupled data read with its parent (gains single-document atomicity). Keep embedded arrays bounded — previews/summaries, not full history.
- Reference one-to-many / many-to-many or unbounded child sets, and anything queried independently. Referencing loses cross-document atomicity — handle multi-doc consistency explicitly.
- Prefer arrays of foreign ids on a clear owning document over link collections, unless the relationship itself carries data.
- Add small denormalized summary fields only when they meaningfully cut reads. Never let an array grow unbounded inside a document (16 MB limit).
- Querying: `find(filter, projection)` — filter chooses documents, projection chooses fields. Use comparison/`$in`/logical operators instead of filtering in code. Use inclusion projection (`field: 1`) for responses; never mix inclusion and exclusion (except `_id`). Fetch the minimum necessary data.
- Indexes at the schema level (`schema.index(...)`), never in services. Index hot query/sort fields. Prefer compound indexes for multi-field filters/sorts; respect the left-prefix rule and align key direction with the sort. `unique` indexes enforce invariants. Index per real workload; avoid index bloat (each index costs writes + RAM/disk).
- Aggregation for analytics/reporting, not ad-hoc code. `$match` as early as possible; `$group` only for real aggregation (`_id` = group key, everything else accumulated); `$sort` after `$group` for top-N; `$lookup` only when joining (flatten the resulting array for single matches); `$project` last to shape output. Keep business meaning (time ranges) in services; repositories take explicit dates/limits. Keep type/id consistency (ObjectId vs string, Date vs number).
- Pagination: cursor-based, not skip/offset, for changing timelines. Define a stable total ordering (`createdAt` + unique tie-breaker like `_id`); fix the sort across pages; use "after/before this item" with strict inequalities (`<`/`>`) to avoid duplicates/gaps. Implement as filter → sort → limit. Align the compound index with the query. Cursors are opaque encoded tokens.

## 6. DAO / DTO Boundary & Mappers

- DAO (Mongoose document shape) stays inside the persistence layer; never returned from controllers or services.
- Map DAO → domain/DTO with dedicated, pure mapper functions (no I/O, no side effects), written field-by-field to prevent accidental leaks. Centralize mappers per feature; call them in the service/handler layer, not in controllers.
- Never leak Mongo internals across the API boundary: rename `_id` → `id`, strip `__v`, soft-delete markers, internal flags; never expose passwords/tokens/secrets; normalize non-JSON types (`Date` → ISO string, `ObjectId` → string).
- Services/handlers return DTOs only; controllers never see DAOs.

## 7. Errors & Validation Boundary

- Don't trust external data. TypeScript checks your code, not the network — validate every inbound payload at the boundary before it reaches domain logic.
- One stable error envelope for all failures: a top-level wrapper with `{ code, message }` (and optional `details`). This is a public contract — keep it backward compatible.
- Machine-readable codes (`UPPER_SNAKE_CASE`, namespaced) drive client logic; human messages are for humans and may change freely without breaking clients.
- Throw Nest HTTP exceptions / a domain `ApiError` type carrying HTTP status + code + message; never hand-craft error responses in handlers.
- Centralize formatting in one global exception filter. No duplicated try/catch + response logic per controller.
- Fail fast at the controller/pipe boundary on malformed input (400). Domain/business-rule validation lives in services and value objects and signals errors in a framework-agnostic way.
- Status mapping: 4xx = client/contract fault (400 invalid, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict). 5xx = unexpected server fault only — never use 500 to mask a client mistake.
- Validators are pure and reusable: stateless, side-effect free; return typed values or throw a known error.

## 8. TypeScript Discipline

- `as` and `any` are confessions. Prefer narrowing, type guards, and schema-derived types. Validate-then-type external data.
- Derive types from one source (DTO/schema); don't redeclare the same shape twice.
- Strong typing on every handler/param/return. No implicit `any`.

## 9. Async, Performance & State

- Prefer `async`/`await`; never block on synchronous I/O or busy-wait loops. Keep work non-blocking and the event loop free.
- Run independent I/O concurrently (`Promise.all`), not serially. Don't mix callbacks and Promises in one path.
- In hot paths, treat any synchronous disk/network/CPU-heavy work as suspicious; keep heavy sync work to init only.
- No hidden performance costs: kill N+1 queries, repeated lookups, and re-fetches; batch and reuse. Filter/permission-scope on the server; the client receives only what it needs.
- Stateless processes: never rely on in-memory state as source of truth — it is lost on restart and not shared across instances. Persist all important state and sessions externally. Each request must be handled correctly without prior in-memory context.
- Make side effects obvious (I/O, state writes, event dispatch) and ownership clear (who creates, updates, and ends each piece of data's lifecycle).

## 10. Auth & Security

- Keep authentication in a dedicated `AuthModule`; user data logic in a separate `UsersModule`; layer controller → service → repository.
- Always hash passwords with a password-hashing algorithm (bcrypt), never plain hashes (MD5/SHA-*). Tune the cost factor via env; rely on bcrypt's built-in salt; store only the single hash string. Verify via `compare`, never by reversing.
- Centralize hashing in a `PasswordService`, used only at the service layer. Never log plaintext passwords anywhere.
- Issue JWTs via `JwtModule`/`JwtService`; secret in env (e.g. `AUTH_SECRET`); minimal payload (id + minimal identity); sensible expiration. Use short-lived access tokens + tracked refresh tokens with server-side revocation.
- Use Passport + `passport-jwt` as the strategy; `validate()` returns the request user. Protect routes with a reusable `JwtAuthGuard` applied at controller or route level — not per-handler logic. Guards are thin: allow/deny only, no heavy logic.
- Use a custom `@CurrentUser()` param decorator (in `common/decorators/`) to inject `req.user`; don't re-parse or re-verify the JWT in controllers.
- Separation: authentication → guards, authorization & domain rules → services.
- Never return passwords, tokens, or secrets in responses. Return generic messages on login failure (don't reveal whether email or password was wrong). Keep secrets out of source control.

## 11. Cross-Cutting Nest Building Blocks

- **Middleware** — low-level, framework-agnostic, runs on every request (logging, request context). Not for auth/validation.
- **Guards** — authorization allow/deny; thin and fast.
- **Pipes** — input validation/transformation before the controller; rely on the global `ValidationPipe` + DTOs.
- **Interceptors** — before/after cross-cutting concerns (timing, response wrapping, mapping). No business logic.
- Registration order = execution order. In any pipeline: log at the start; validate before business logic; call `next()` only when valid and no response sent; short-circuit with an early return on failure.
- Organize shared cross-cutting code under `src/common/{guards,pipes,interceptors,decorators,filters}`; keep each class small, focused, reusable.

## 12. Configuration & Operations (12-Factor)

- Decouple config from code: no hardcoded ports, URLs, or secrets. Inject everything at runtime.
- Load via global `ConfigModule.forRoot({ isGlobal: true })`; access through `ConfigService`, never `process.env` directly.
- Treat `process.env` as untrusted: define a Joi validation schema for all required vars (types, allowed values, required/optional) and wire it into `ConfigModule` to fail fast on missing/invalid config.
- Keep real values in `.env` (gitignored); keep a `.env.example` template with all keys and no secrets. Update both the schema and the example when adding/removing a var.
- Select environment config from `NODE_ENV`, not scattered conditionals. Use consistent, descriptive var names.

## 13. Testing

- Use Jest (+ supertest for HTTP). Test real behavior — what a caller does — not internal construction. A test that can't fail isn't a test.
- Unit-test domain logic, services/handlers, mappers, and validators in isolation (no framework, no DB) — DI makes this easy via mocked ports.
- Assert mappers include/exclude the right fields and that DTOs never carry DB-specific or sensitive fields. Treat these as guards against future leaks.
- e2e-test the HTTP contract (status codes, envelope, error shape) end-to-end.
- Refactor only behind passing tests; never change internal structure without tests guarding external behavior.

## 14. Code Craft & Process

- Make intent obvious — if a name needs a comment, the name is wrong. Comment the why (tradeoffs, business rules), not the what; treat a needed explanatory comment as a refactor smell.
- Do one thing — small, single-task functions, free of hidden side effects. Prefer simple, inlined code over premature abstraction; every abstraction is debt that must earn its interest.
- Boy Scout rule — leave each file cleaner than you found it. Fix broken windows — remove bad hacks and failing tests before rot spreads. Remove dead code — it lies to the next reader.
- Shoot tracer bullets — build a thin end-to-end skeleton first, then flesh it out.
- Automate formatting (ESLint/Prettier/strict mode) so reviews argue about logic, not style.
- Focused commits: one logical change each, `topic: verb description`. Treat PRs as artifacts: state what changed, why, where to review, what could break.
