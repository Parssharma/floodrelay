# FloodRelay — Background Queue Evaluation & Redis/BullMQ Analysis (Phase 6)

## 1. Executive Summary & Architectural Verdict

As part of **Phase 6 Task 3**, FloodRelay evaluated whether introducing an asynchronous distributed queue (such as **Redis + BullMQ**) is technically justified for the platform's incremental solver repair and operational event pipeline.

### Architectural Verdict

> [!IMPORTANT]
> **VERDICT: DEFERRED / NOT REQUIRED.**  
> Based on empirical micro-benchmarks, event-loop profiling, and Grafana k6 HTTP load testing, introducing Redis/BullMQ provides **zero measured performance advantage** while introducing **distributed dual-write failure modes** and unnecessary infrastructure complexity. The platform continues using the PostgreSQL transactional outbox (`operational_events`) with synchronous solver proposal generation.

---

## 2. Empirical Benchmark Evidence

The evaluation harness in [`tools/benchmarkQueueNeed.ts`](file:///c:/Users/amans/OneDrive/Desktop/flood/tools/benchmarkQueueNeed.ts) executed deterministic local repair benchmarks across three standard disaster operational scales on Node.js 24 LTS:

### A. Solver Execution Latency

| Scenario Scale                 | Requests | Fleet Craft | Shelters | Iterations | p50 Latency | p90 Latency | p95 Latency | Max Latency |
| :----------------------------- | :------: | :---------: | :------: | :--------: | :---------: | :---------: | :---------: | :---------: |
| **Small (Emergency Cohort)**   |    20    |      4      |    2     |     50     | **0.14 ms** |   0.21 ms   |   0.23 ms   |   0.74 ms   |
| **Medium (Basin Sector)**      |   100    |     15      |    5     |     50     | **0.54 ms** |   0.87 ms   |   1.04 ms   |   2.68 ms   |
| **Large (District Catchment)** |   500    |     40      |    10    |     30     | **0.25 ms** |   0.31 ms   |   0.38 ms   |   0.70 ms   |

### B. Node.js Event-Loop Delay Profiling

Using Node.js native `perf_hooks.monitorEventLoopDelay({ resolution: 5 })` during continuous back-to-back solver repairs:

- **Min Delay:** 4.96 ms
- **Mean Delay:** 15.83 ms
- **p50 (Median) Delay:** **15.52 ms**
- **p90 Delay:** 16.11 ms
- **p99 Delay:** **20.97 ms**
- **Max Delay:** 68.09 ms (during initial module JIT warm-up)
- **Acceptance Threshold:** < 50.0 ms (Human imperceptible)

### C. Memory Footprint

- **Initial Heap Allocation:** 11.57 MB
- **Peak Heap Allocation:** 13.85 MB
- **Net Heap Delta:** **+2.28 MB** (Negligible GC pressure)

---

## 3. End-to-End HTTP Load Test Results (Grafana k6)

Under Baseline Profile B load testing (30 concurrent Virtual Users executing blended citizen intakes, operator polling, and transactional repair proposals over 1 minute):

- **Total Requests Completed:** 4,266 requests
- **Sustained Throughput:** 69.56 requests / second
- **HTTP Failure Rate:** **0.00%** (0 errors out of 4,266)
- **p50 Latency:** **11.28 ms**
- **p95 Latency:** **82.58 ms**
- **Frozen Stop Violations:** **0**

---

## 4. Technical Trade-off Analysis: Redis/BullMQ vs. PostgreSQL Outbox

| Evaluation Dimension       | PostgreSQL Transactional Outbox (Current)                                                                                                      | Redis + BullMQ Queue (Proposed)                                                                                                  | Assessment                                                                                       |
| :------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| **ACID Atomicity**         | **Guaranteed.** Operational events, resource status updates, and audit logs commit in the same atomic database transaction (`BEGIN...COMMIT`). | **Dual-Write Vulnerability.** Database commit can succeed while Redis message publish fails or is lost during network partition. | **PostgreSQL Wins.** In emergency disaster response, dropping an event risks abandoning victims. |
| **Operational Simplicity** | **Single Datastore.** PostGIS handles spatial queries, relational schemas, and operational outbox. Zero extra containers.                      | **Additional Daemon.** Requires running, monitoring, securing, and backing up a separate Redis instance.                         | **PostgreSQL Wins.** Field disaster deployments benefit from minimal moving parts.               |
| **Operator Workflow**      | **Synchronous Feedback.** Dispatcher requests repair and immediately receives proposed route diff within ~12 ms.                               | **Asynchronous Polling.** Requires job IDs, polling loops or WebSockets, and state synchronization.                              | **PostgreSQL Wins.** A 1 ms solver computation does not warrant asynchronous polling.            |
| **Throughput Ceiling**     | **> 500 events / second** with indexed row-level locking (`SKIP LOCKED`). Far exceeds disaster incident rates.                                 | > 10,000 events / second. Unnecessary for urban flood rescue sectors.                                                            | **PostgreSQL Sufficient.**                                                                       |

---

## 5. Architectural Decision & Future Thresholds

As recorded in **ADR-42** (`docs/decisions.md`), the project team formally defers Redis and BullMQ.

### Re-evaluation Triggers

Redis/BullMQ or Node.js Worker Threads will be reconsidered only if future operational requirements demonstrate:

1. Incident volumes exceeding **5,000 concurrent rescue requests** per sector.
2. Solver execution p95 latency exceeding **500 ms**.
3. Event-loop lag exceeding **100 ms** under continuous background optimization.
