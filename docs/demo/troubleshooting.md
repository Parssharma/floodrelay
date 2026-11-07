# FloodRelay Demonstration System — Troubleshooting Guide

This guide details common issues encountered when setting up and running the demonstration environment, along with rapid resolution steps.

---

## 1. Database Connection & Authentication Failures

### Issue: `password authentication failed for user "floodrelay"` (Code: `28P01`)

**Cause:** A local PostgreSQL instance running natively on Windows port 5432 with different credentials is intercepting connections intended for the Docker PostGIS container.

**Resolution:**

1. Check running Windows PostgreSQL services:
   ```powershell
   Get-Service *postgres*
   ```
2. If native PostgreSQL is running on port 5432:
   - Either start the project PostGIS container on a dedicated alternate port (e.g. `POSTGRES_PORT=5433` in `.env` and `DATABASE_URL=postgresql://floodrelay:floodrelay_dev@localhost:5433/floodrelay`), OR
   - Stop the native Windows service temporarily:
     ```powershell
     Stop-Service postgresql-x64-18
     ```
   - Then start the official PostGIS container:
     ```powershell
     docker-compose -f infra/docker-compose.yml up -d
     ```
3. Verify connection:
   ```powershell
   npm run demo:setup
   ```

---

## 2. Port Binding Conflicts

### Issue: Port 3000 or 5432 Already in Use

**Symptoms:** `listen EADDRINUSE: address already in use :::3000`

**Resolution:**

1. Find which process is holding port 3000 or 5432:
   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
   ```
2. Terminate the blocking process:
   ```powershell
   Stop-Process -Id <ProcessId> -Force
   ```
3. Alternatively, launch the API on an alternate port:
   ```powershell
   $env:PORT=3001; npm run dev --workspace=@floodrelay/api
   ```

---

## 3. Database Safety Guard Failures

### Issue: `DEMO SAFETY VIOLATION: Database target does not appear to be a designated database`

**Cause:** The demo setup script enforces strict database safety guards to prevent accidental deletion or mutation of production data.

**Resolution:**

- Verify that `NODE_ENV` is NOT set to `production`.
- Verify that `DATABASE_URL` contains `floodrelay`, `demo`, or `test`.
- Example valid `.env` configuration:
  ```env
  DATABASE_URL=postgresql://floodrelay:floodrelay_dev@localhost:5432/floodrelay
  ```

---

## 4. Open-Meteo Upstream River Forecast Unavailable

### Issue: Network timeout or air-gapped evaluation environment

**Cause:** Evaluation workstation lacks outbound Internet access to reach Open-Meteo Flood API (`https://flood-api.open-meteo.com/v1/flood`).

**Behavior:**

- FloodRelay automatically falls back to an offline deterministic synthetic GloFAS hydrological model for the Yamuna River reach.
- The returned forecast context will include:
  ```json
  "freshness": "STALE_FALLBACK",
  "provider": "Copernicus GloFAS 4.0 (Offline Fallback Fixture)"
  ```
- No server crashes or test failures occur.

---

## 5. Frozen Stops Not Preserved Error

### Issue: `SAFETY VIOLATION: Repair violated committed frozen stops`

**Cause:** Injected repair solver produced a route mutation that altered a stop where `is_frozen = true`.

**Resolution:**

- Inspect `services/api/src/services/repairOrchestrationService.ts`.
- Ensure `baselineAssignmentId` is passed to the repair call so that committed stops are locked.
- Run automated verification:
  ```powershell
  npx vitest run services/api/src/demoWorkflow.test.ts
  ```
