# Catalyst Content Server — coding standards

This service is being refactored to follow the **Well-Known Components (WKC)** pattern strictly. Apply these rules when adding or modifying code.

See the `dcl-wkc-components` skill for the full reference (factory pattern, DI, lifecycle, JSDoc, OpenAPI).

## Component types

- **Adapter** (`src/adapters/<name>/`) — does I/O. Database pool, repositories (per-domain SQL), file storage, HTTP clients, blockchain providers, external SDK wrappers, in-memory caches/state, scheduled-job runners.
- **Logic** (`src/logic/<name>/`) — rules and orchestration. Depends on adapters and/or other logic. Can be pure.

## Per-component file split

Every component lives in its own folder with these files:

- `component.ts` — exports the async factory `create<Name>(components: Pick<AppComponents, '...'>)`
- `types.ts` — the component's interfaces and supporting types
- `index.ts` — re-exports the public surface
- `errors.ts` — *optional*; custom exception classes the component throws

## Rules

- **Components throw typed exceptions** defined in their `errors.ts`. No error codes, no `Result`/`Either` wrappers.
- **Controllers are NOT components.** They live under `src/controllers/handlers/` and only: (1) validate HTTP-shape input, (2) call logic components, (3) catch typed errors and map to HTTP status via the central error middleware in `src/controllers/middlewares.ts`.
- **Repositories own SQL, not transactions.** Repo methods take `db: DatabaseClient` as a parameter on every call. The orchestrating logic component opens `database.transaction(tx => ...)` and threads `tx` through repo calls.
- **Dependency injection.** Factories take deps as `Pick<AppComponents, '...'>` listing only what they need.
- **Lifecycle.** Stateful components implement `START_COMPONENT`/`STOP_COMPONENT`. Examples: DB pool open/drain, scheduled jobs cancel-on-stop, in-memory caches warm-up at start.

## Refactor in progress

The codebase is migrating from a legacy `ports/` + `service/` layout to the WKC `adapters/` + `logic/` layout. New code should be written in the WKC layout from the start; existing code is being moved phase-by-phase.
