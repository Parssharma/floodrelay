# FloodRelay — k6 Load Testing Suite

This directory contains the automated end-to-end load testing suite for FloodRelay, measuring how reliably the backend API, live operator polling, citizen request intake, and repair solver orchestration perform under concurrent traffic.

---

## 1. Directory Structure

```text
tests/load/
├── config.js              # Load profile definitions, thresholds & env resolution
├── index.js               # Main k6 execution entrypoint (blended traffic or targeted)
├── helpers/
│   ├── auth.js            # Operator authentication & session token caching
│   └── data.js            # Synthetic deterministic generator (Delhi basin coordinates)
├── scenarios/
│   ├── citizen-intake.js   # POST /requests (valid, idempotent replay, duplicate flagging)
│   ├── operator-polling.js # GET /requests, /assignments, /operations/events
│   ├── api-read.js         # GET /health, /openapi.json (caching verification)
│   └── repair-workflow.js  # POST /operations/repair (frozen stops & non-commitment)
└── README.md              # Operational guide
```

---

## 2. Load Profiles

| Profile                         | Virtual Users (VUs)      | Duration | Objective                                                             |
| :------------------------------ | :----------------------- | :------- | :-------------------------------------------------------------------- |
| **Smoke** (`smoke`)             | 5 VUs                    | 30s      | Quick sanity check of scripts & endpoints. Zero 5xx errors permitted. |
| **Baseline** (`baseline`)       | 10 → 25 → 50 VUs         | ~3 mins  | Stable-state production-like performance measurement. p95 < 1s.       |
| **Stress** (`stress`)           | 50 → 100 → 250 → 500 VUs | ~4 mins  | Identifies resource limits and degradation points under surge load.   |
| **Scalability** (`scalability`) | 100 → 500 → 1000 VUs     | ~6 mins  | Extended scalability in an isolated dedicated environment.            |

---

## 3. Configuration & Environment Variables

| Variable             | Default                 | Description                                                                              |
| :------------------- | :---------------------- | :--------------------------------------------------------------------------------------- |
| `API_BASE_URL`       | `http://localhost:3000` | Target API host and port.                                                                |
| `LOAD_PROFILE`       | `smoke`                 | Selected profile (`smoke`, `baseline`, `stress`, `scalability`).                         |
| `SCENARIO`           | `all`                   | Specific scenario (`all`, `intake`, `polling`, `read`, `repair`).                        |
| `VIRTUAL_USERS`      | _Profile default_       | Optional override for concurrent VUs.                                                    |
| `TEST_DURATION`      | _Profile default_       | Optional override for test duration (e.g., `45s`, `2m`).                                 |
| `LOAD_TEST_USERNAME` | _(None)_                | Test operator username (required for authenticated scenarios).                           |
| `LOAD_TEST_PASSWORD` | _(None)_                | Test operator password (required for authenticated scenarios — zero hardcoded defaults). |

> [!IMPORTANT]
> **Credential Security**: Hardcoded passwords are strictly prohibited. Authenticated scenarios and profiles (`baseline`, `stress`, `scalability`, `polling`, `repair`) require credentials explicitly provided via `LOAD_TEST_USERNAME` and `LOAD_TEST_PASSWORD`. Unauthenticated smoke testing remains functional without credentials.

---

## 4. Execution Commands

### Prerequisites

Ensure the FloodRelay API server is running on `http://localhost:3000` (or set `API_BASE_URL`).

### A. Run Smoke Test (Local k6 binary or npm script)

```bash
# Using npm script:
npm run test:load:smoke

# Or directly with k6:
k6 run -e LOAD_PROFILE=smoke tests/load/index.js
```

### B. Run Baseline Test (Requires Operator Credentials)

```bash
# Provide disposable operator credentials via environment variables:
LOAD_TEST_USERNAME=test_operator LOAD_TEST_PASSWORD=<secure_password> npm run test:load:baseline
```

### C. Run Specific Scenario (e.g. Citizen Intake only)

```bash
# Public unauthenticated intake:
k6 run -e LOAD_PROFILE=smoke -e SCENARIO=intake tests/load/index.js
```

### D. Exporting Metrics (JSON / Summary)

```bash
k6 run -e LOAD_PROFILE=smoke --summary-export=load-summary.json tests/load/index.js
```

---

## 5. Engineering Acceptance Thresholds

| Metric                                    | Target Goal | Status Check                                  |
| :---------------------------------------- | :---------- | :-------------------------------------------- |
| **HTTP Failure Rate (`http_req_failed`)** | `< 1%`      | Zero 5xx errors in baseline                   |
| **API Read Latency (`p(95)`)**            | `< 1000ms`  | Baseline stability                            |
| **API Write Latency (`p(95)`)**           | `< 2000ms`  | Citizen intake                                |
| **Citizen Intake Success Rate**           | `> 98%`     | Valid submissions persisted                   |
| **Data Integrity Violations**             | `0`         | Idempotent replays & duplicate flags verified |
| **Frozen Committed Stop Violations**      | `0`         | Frozen stops preserved across replans         |
| **Unauthorized Commits**                  | `0`         | Repair proposals never auto-committed         |
| **Repair Unexpected Failures**            | `0`         | Solver errors, invalid states rejected        |
