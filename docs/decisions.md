# Architecture Decision Log

## Template

When recording a new decision, copy this template and fill it in:

```
### ADR-<number>: <Title>

- **Date:** YYYY-MM-DD
- **Decision:** What was decided.
- **Context:** Why this decision was needed.
- **Alternatives considered:** What else was evaluated.
- **Consequence:** What follows from this decision.
```

---

### ADR-1: Next.js + React frontend

- **Date:** 2026-10-10
- **Decision:** Use Next.js (App Router) with React and TypeScript for the frontend.
- **Context:** The university requires Next.js and React.js for the project.
- **Alternatives considered:** None; this is a mandatory requirement.
- **Consequence:** Frontend must use the Next.js App Router and React component model.

---

### ADR-2: Separate Node.js backend

- **Date:** 2026-10-10
- **Decision:** Run a separate Node.js backend service rather than using Next.js API routes for all server logic.
- **Context:** The system needs long-running solver computations and live update channels (polling, then Socket.IO). These do not fit well into serverless or edge function models.
- **Alternatives considered:** Next.js API routes only; serverless functions.
- **Consequence:** Two deployable units (frontend and backend). Stronger separation of concerns and a clearer backend story for the portfolio.

---

### ADR-3: PostgreSQL + PostGIS

- **Date:** 2026-10-10
- **Decision:** Use PostgreSQL with PostGIS for the database.
- **Context:** The system requires spatial queries (nearest neighbours, bounding boxes, distance calculations). PostGIS also provides a built-in DBSCAN implementation that can be used to verify our own clustering.
- **Alternatives considered:** MongoDB with geospatial indexes; SQLite with SpatiaLite.
- **Consequence:** Requires running a PostgreSQL instance (via docker-compose for development). The team needs basic familiarity with spatial SQL.

---

### ADR-4: No machine learning

- **Date:** 2026-10-10
- **Decision:** Do not use machine learning. Use reliable deterministic algorithms.
- **Context:** No measured need for ML has appeared. Deterministic algorithms are easier to test, debug, explain, and reproduce.
- **Alternatives considered:** Demand prediction models; ML-based routing.
- **Consequence:** All outputs are the result of deterministic algorithms. This may be revisited if a measured need appears.

---

### ADR-5: Build solver and evaluation before infrastructure

- **Date:** 2026-10-10
- **Decision:** Implement and evaluate the solver library before adding infrastructure such as queues, real-time layers, or routing servers.
- **Context:** The core value of the project is the allocation logic. Validating it early with a test harness reduces risk. Infrastructure can be added when measurements or features require it.
- **Alternatives considered:** Building the full stack end-to-end first.
- **Consequence:** The solver is developed and tested as a standalone library (`packages/solver`) with no database, HTTP, or UI dependencies.

---

### ADR-6: Operator commits assignments

- **Date:** 2026-10-10
- **Decision:** The system proposes assignments, but a human operator must review and commit them before they are dispatched.
- **Context:** This is a decision-support tool, not an autonomous dispatch system. Human oversight is required for safety and accountability.
- **Alternatives considered:** Automatic dispatch with operator override.
- **Consequence:** The UI must clearly present proposed vs. committed assignments. Committed or dispatched stops are frozen and not reshuffled by re-optimization.

---

### ADR-7: Backend framework: Express with TypeScript

- **Date:** 2026-10-15
- **Decision:** Use Express with TypeScript (strict mode) as the backend framework.
- **Context:** The team needed to pick a backend framework for the separate Node.js service. The team already knows Express, and setup is minimal. The main effort goes to the solver and allocation workflow, not framework features. TypeScript with strict mode is used across all packages (api, solver, web) so that shared types catch field mismatches at compile time.
- **Alternatives considered:** Fastify (faster, schema-based validation, but less team familiarity); NestJS (more structure, but heavier and more opinionated than needed); plain JavaScript (no compile-time type checking across packages).
- **Consequence:** The backend uses Express with TypeScript. The framework can be changed later because the solver has no framework dependency and the API surface is small at this stage.

---

### ADR-8: Node.js 24 LTS

- **Date:** 2026-10-15
- **Decision:** Standardize on Node.js 24 LTS across development, monorepo packages, and CI (enforced via `.nvmrc` and root `package.json` `engines`).
- **Context:** A reliable, modern LTS version of Node.js is required for monorepo development and GitHub Actions CI.
- **Alternatives considered:** Node 22 (maintenance LTS); Node 26 (entering LTS in late October 2026); Node 20 (end-of-life).
- **Consequence:** Developers and CI runners must use Node.js 24+.

---

### ADR-9: npm workspaces

- **Date:** 2026-10-15
- **Decision:** Use npm workspaces for managing monorepo packages (`apps/*`, `services/*`, `packages/*`).
- **Context:** The project needs cross-package linking (`@floodrelay/solver` -> `@floodrelay/shared`) and unified scripts (`lint`, `typecheck`, `test`) without requiring extra package managers.
- **Alternatives considered:** pnpm (requires separate tool installation and store semantics); yarn (adds another CLI dependency when npm is already bundled with Node).
- **Consequence:** Dependency management and script orchestration rely solely on standard npm with zero additional global tooling needed.

---

### ADR-10: ESLint (flat config) + Prettier + Vitest

- **Date:** 2026-10-15
- **Decision:** Use ESLint with typescript-eslint flat config for linting, Prettier for formatting, and Vitest for testing packages.
- **Context:** Need consistent code style, static analysis, and fast unit test execution across TypeScript ES modules without complex transpilation setups.
- **Alternatives considered:** Jest (slower, requires extra Babel or ts-jest transform configuration for native ESM and TypeScript).
- **Consequence:** Fast, modern test execution with native TypeScript and ESM support in Vitest, and clean separation between code formatting and linting rules.

---

### ADR-11: Shelter drop-off model

- **Date:** 2026-10-16
- **Decision:** Route rescue vehicles to drop off rescued citizens at the nearest safe shelter or designated relief depot once a trip completes or capacity is reached, resetting vehicle onboard load to zero for subsequent pickup batches.
- **Context:** Rescue vehicles (inflatable boats, high-water trucks) have finite passenger capacities. Unlike package delivery where vehicle load only decreases, passenger rescue requires multi-trip cycles where vehicles pick up evacuees, transport them to safe shelter destinations, and then deploy on subsequent rescue runs within maximum operational shift limits.
- **Alternatives considered:**
  - *Single-trip return to depot:* Vehicle only executes one run and stops. Rejected because emergency resources are scarce and must execute multiple pickup-and-shelter cycles during flood operations.
  - *Dynamic multi-shelter load-balancing:* Dynamically distributing evacuees across multiple distant shelters based on live shelter occupancy. Postponed to later phases to keep solver core deterministic and testable before live database integration.
- **Consequence:** Solvers automatically generate `DROPOFF` stops at the nearest shelter when vehicle load is non-zero, properly reflecting round-trip rescue times in plan metrics.

---

### ADR-12: Flood impedance multipliers

- **Date:** 2026-10-16
- **Decision:** Model waterlogged and hazardous route segments using a dimensionless flood impedance multiplier (`ASSUMED_FLOOD_IMPEDANCE_MULTIPLIER` = 1.0 baseline, > 1.0 for slowed segments) integrated into the `TravelTimeProvider` interface.
- **Context:** In flood conditions, water depth, debris, and current significantly slow vehicle transit even on passable roads. The standard straight-line or road network distance does not account for this localized velocity reduction. A multiplier allows representing reduced transit speeds across waterlogged zones without requiring a full hydrodynamic simulation model.
- **Alternatives considered:**
  - *Binary open/closed road modeling:* Marking roads as either 100% open or 100% blocked. Rejected as too coarse, because emergency high-water vehicles and rescue boats often navigate submerged streets at reduced speeds rather than treating every flooded street as a complete cutoff.
  - *Physics-based hydrodynamic flow models:* Simulating water velocities and vehicle propulsion equations. Rejected because input data is rarely available during emergency operations and would violate ADR-4 (simplicity and deterministic reliability).
- **Consequence:** Travel time calculations scale duration by `impedance`, providing a flexible parameter that operators or flood forecast layers can adjust per zone in subsequent phases.
