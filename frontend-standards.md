# Frontend Standards — TypeScript + React (NestJS backend)

This document defines how frontend code is written in this project. Follow it for every React/TypeScript change. The backend is NestJS; the backend owns the API contract. These rules are mandatory unless a reviewer explicitly approves an exception in the PR.

## 0. Core Philosophy

- Code is read far more than it is written. Optimize for the next reader.
- Make it clear, safe, and hard to misuse — not just working.
- Every abstraction is debt. Add one only when it earns its keep; inline when inlining is clearer.
- Boy Scout rule: leave every file a little cleaner than you found it.
- Refactor only behind a safety net of tests. Behavior first, cleanliness second.

## 1. Project & Folder Structure (UI-Mirrored)

The folder tree mirrors the UI component tree. There are no loose files — every file lives inside a folder that owns it.

**Rules:**

- Each component is a folder named in PascalCase (e.g. `ChatPage/`).
- A component folder contains only the sub-folders it actually needs — never a fixed template. Available sub-folders:
  - `view/` — the component's own markup: `ChatPage.tsx` + its styles (`ChatPage.module.css` or Tailwind classes inline). The visual unit lives here.
  - `components/` — child components, each its own folder, recursively mirroring the UI hierarchy.
  - `hooks/` — component-scoped custom hooks (`useChatPage.ts`, etc.).
  - `state/` — local reducers / state machines for this component.
  - `api/` — data-access for this feature (TanStack Query hooks + the typed client calls).
  - `types.ts` — domain types for this feature.
- A child component that itself grows large gets the same treatment: its own `components/`, `hooks/`, `state/`, `api/` — again only what it needs. The nesting goes as deep as the UI does.
- Small leaf components don't need sub-folders — a single folder with the `.tsx` and its style file is fine.
- A thin top-level `shared/` (or `common/`) holds only genuinely cross-cutting code (design-system primitives, shared utilities, the generated API client). If something belongs to one feature, it lives in that feature.

**Naming:**

- PascalCase — components, types, interfaces, files that export a component/type.
- camelCase — variables, functions, hooks instances, state.
- Hooks start with `use` (`useToggle`, `useChatMessages`).
- Singular for an item type (`Message`), plural for collections (`messages`).
- One main component per file.

## 2. Components

- Small, focused, single-responsibility. Prefer many small components over a few large ones.
- Split presentational from container components:
  - **Presentational** — pure props → JSX. No domain state, no side effects, no data fetching. May take callback props (`onSend`, `onSelect`).
  - **Container** — owns feature state and handlers, decides what data/callbacks to pass down, renders mostly presentational children with minimal markup.
- Props are read-only inputs. Never mutate props.
- Define a dedicated, explicit props type per component. No inline object prop types.
- Keep props minimal and cohesive — only what the component truly needs. Optional (`?`) only when truly optional.
- Destructure props in the signature; provide defaults via destructuring, not `undefined` checks in JSX.
- Type `children` as `React.ReactNode`. Use `children` (and named slots / compound components) for layout and composition instead of many boolean/string config props.
- Prefer composition over configuration. Add a config prop only for genuinely behavioral options.
- Unidirectional data flow: data flows down via props, events flow up via callbacks.
- No "god components" — split when props or `useState` calls pile up.
- Keep JSX shallow; extract nested blocks into named subcomponents. The `return` block is layout, not business logic.

## 3. State Management

- Predictable state: one concept, one owner.
- `useState` for simple, independent values (≈3 or fewer). `useReducer` when multiple fields change together or form a coherent state machine — model state as one typed object, use discriminated-union actions, keep the reducer pure (new state, no mutation, no side effects, no async).
- Lift state to the smallest common ancestor that needs it. Siblings never each own a copy of the same logical state.
- Treat state as immutable — always create new arrays/objects.
- Use the functional updater (`setX(prev => …)`) when next state depends on previous.
- Derive values from existing state instead of duplicating them in state.
- Context for cross-cutting shared state only (theme, auth, settings) — not as a global store. Strongly type the value (`XxxContextValue`), expose it through a custom hook (`useTheme`), keep the shape minimal and stable, and scope the provider as low as possible. Keep rapidly-changing local state out of Context.
- Extract reusable stateful logic into custom hooks. A hook owns related state + effects + callbacks and returns a small, well-named API. One responsibility per hook; compose hooks instead of building "god hooks". Obey the Rules of Hooks (top level only, only inside components/hooks).

## 4. Server State & Data Fetching

- TanStack Query (React Query) is the standard for all server state. Do not hand-roll `fetch` + `useEffect` + `AbortController` + request-ID guards in feature code — Query handles caching, deduping, races, retries, and loading/error states. Raw `fetch` is reserved for genuine edge cases.
- Keep query/mutation hooks in the feature's `api/` folder (`useMessages`, `useSendMessage`).
- Components stay thin — they consume query hooks, they don't orchestrate transport.
- Model every async surface with explicit, mutually-exclusive states: idle / loading / success / empty / error.
- Never skip loading, empty, or error because "the happy path works".
- "Empty" is success-with-no-items and gets its own UX, not an error.
- Always provide a user-friendly error message and a retry path.
- Extract tiny presentational components for spinner / error box / empty state.
- The UI must always answer "what's happening?" and "what can I do?".

## 5. Optimistic Updates

When faking success before the server confirms, you must own the full lifecycle:

- Separate confirmed data from pending/optimistic data; derive a single combined view for the UI.
- Give each item a `status` (`"sending" | "sent" | "failed"`) and a temporary id (`tempId`) to correlate the server response.
- Roll back only on actual failure (reject / non-OK), keyed by the temp id — never time-based.
- Keep optimistic + rollback logic in a hook or state module; keep UI components stateless about server logic.
- TanStack Query's mutation `onMutate` / `onError` / `onSettled` is the preferred place for this.

## 6. Forms

- React Hook Form + Zod resolver for any non-trivial form. Reuse the same Zod schemas used at the API boundary so validation lives in one place.
- Raw controlled inputs (`value` + `onChange`) are fine only for trivial single-field cases.
- Controlled-input rules when hand-building: single source of truth in state, never mix controlled/uncontrolled, `event.preventDefault()` on submit, validate on submit (unless UX needs blur/change), store errors in state and render them (no `alert`).
- Keep handlers small and well-named (`handleSubmit`, `handleNameChange`).
- Semantic, accessible structure: `<form>`, `<label>`, `<button type="submit">`.
- Preserve user input — never clear what a bug or failed save erased.
- Keyboard parity: Enter/Escape/blur and mouse trigger the same code path. Chat-style: Enter sends, Shift+Enter newlines, ignore whitespace-only.

## 7. Effects & DOM

- `useEffect` is for real side effects only: network (when not using Query), subscriptions, timers, browser APIs.
- Never use an effect to compute a value derivable from state/props — compute it in render.
- Dependency array is the exact set of values the effect depends on; keep it accurate and minimal. `[]` = mount-only; no array = every render (rarely what you want).
- One concern per effect. Always clean up (clear timers, remove listeners, abort, unsubscribe).
- Let React own the DOM. No `getElementById` / manual patching. For focus/scroll, use `useRef`, confined to the component that owns the element, inside an effect — not during render.

## 8. TypeScript & API Safety

- `strict: true`. `any` and `as` are confessions — use narrowing, type guards, and schema parsing instead.
- Don't trust external data. TypeScript checks your code, not the network.
- Validate at every API boundary with Zod. Parse responses before they enter state; derive the TypeScript types from the schema (`z.infer<typeof Schema>`). One schema, one error shape.
- Prefer precise types: literal unions over free-form strings, domain object types over loose shapes, named/extracted types over repeated inline ones. Keep types small, composable, and aligned with the domain language.
- Use generics for "same type in, same type out" wrappers; let inference do the work where it can.

## 9. Frontend ↔ NestJS Contract

- The NestJS backend is the source of truth for the API contract.
- Generate the frontend API client and types from the backend's OpenAPI/Swagger spec (or consume a shared types package). Do not redefine backend DTOs by hand on the frontend.
- Even with generated types, Zod-validate responses at the boundary — generated types describe the contract, runtime validation enforces it.
- Filtering and permission checks belong on the server; the client renders only what it receives.

## 10. Testing

- Test behavior, not implementation. Test what the user sees and does; don't assert internal state, hooks, or specific calls.
- Stack: Vitest (Vite-native, Jest-like) + React Testing Library + `@testing-library/jest-dom`, in jsdom. A single shared setup file. Test files mirror and sit next to source files.
- Query by role/label (`getByRole` with `name`) first; `getByTestId` is a last resort.
- Use `userEvent` for interactions, not low-level events. AAA structure (Arrange → Act → Assert), one behavior per test.
- `renderHook` + `result.current` for custom hooks; test state transitions, not internals.
- Testing pyramid: many unit (pure logic), fewer integration/component, very few E2E.
- Playwright for a small set of critical user-journey E2E tests.
- No hard coverage percentage. Require tests for behavior and for every bug fix instead of chasing a number.
- Keep tests small, fast, deterministic — no hidden timeouts or randomness. A test that can't fail isn't a test.

## 11. Performance (Only When Measured)

- Optimize only with evidence. Profile with React DevTools before changing anything; re-profile after.
- Accept normal re-renders for cheap components.
- `useMemo` only for expensive pure calculations with accurate deps — not "just in case".
- `useCallback` to stabilize function identity passed to memoized children — not to speed up the function body.
- `React.memo` for pure, presentational components with high render cost or frequency; pair with `useMemo`/`useCallback` on object/function props so the shallow compare actually helps. Don't memoize trivial components.

## 12. Tooling & Process (Non-Negotiable)

- `tsconfig` `strict: true`, `noImplicitAny: true`. No `any`/`as` escapes.
- ESLint + Prettier own formatting and lint rules; enforced in CI and via pre-commit hook (husky + lint-staged).
- Humans argue about logic, tools argue about formatting.
- Focused commits: one logical change each, `topic: verb description`.
- PRs are artifacts: state what changed, why, where to review, and what could break.
