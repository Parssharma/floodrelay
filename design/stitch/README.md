# FloodRelay — UI Prototypes (Google Stitch Export)

This directory contains high-fidelity responsive UI prototypes for **FloodRelay Phase 3 (Frontend)**, generated and exported via **Google Stitch** (Project ID: `3162153528152756353`, "FloodRelay Citizen Emergency Portal").

All 8 screens are fully styled standalone HTML pages implementing the **Institutional Resilience & Civic Functionalism** design system using Tailwind CSS, Google Fonts (**Manrope**, **Public Sans**, **Inter**), and Google **Material Symbols Outlined** icons.

---

## Directory Structure

```
design/stitch/
├── README.md
├── SHA256SUMS.txt
├── citizen/
│   ├── citizen-home.html
│   ├── citizen-request-form.html
│   └── citizen-confirmation.html
└── operator/
    ├── operator-overview.html
    ├── operator-requests.html
    ├── operator-map.html
    ├── operator-assignments.html
    └── operator-assignment-review.html
```

---

## Screen Catalog & Route Mapping

### 1. Citizen Portal (`citizen/`)
The citizen interface is engineered for high-stress, low-bandwidth crisis scenarios. It prioritizes clarity, minimal cognitive load, clear instructions, and rapid tap interactions without distracting visual noise.

| File | Target Route | Viewport | Description |
| :--- | :--- | :--- | :--- |
| [`citizen-home.html`](citizen/citizen-home.html) | `/citizen` | Mobile / Responsive | Public landing view featuring persistent life-safety emergency banners, primary call-to-action triggers, 3-step extraction flow, survival directives, and official helpline access. |
| [`citizen-request-form.html`](citizen/citizen-request-form.html) | `/citizen/request` | Mobile / Responsive | Structured intake form capturing GPS/map pin location, passenger head count, urgency triage (LOW, MEDIUM, HIGH, CRITICAL), medical needs toggle, and rescue notes. |
| [`citizen-confirmation.html`](citizen/citizen-confirmation.html) | `/citizen/confirmation` | Mobile / Responsive | Post-intake confirmation displaying unique tracking code, queue verification status, checklist for imminent extraction, and direct dispatch helplines. |

### 2. Operator Command Center (`operator/`)
The operator portal provides a high-density, mission-critical workspace for emergency dispatchers, coordinators, and logistics leads managing fleet assets, incoming distress calls, and multi-trip solver routes.

| File | Target Route | Viewport | Description |
| :--- | :--- | :--- | :--- |
| [`operator-overview.html`](operator/operator-overview.html) | `/operator` | Desktop / High-Density | Executive operational dashboard with active fleet status, pending request counts, critical urgency triage cards, capacity gauges, and quick dispatch actions. |
| [`operator-requests.html`](operator/operator-requests.html) | `/operator/requests` | Desktop / High-Density | Comprehensive request management table supporting urgency filters, search, duplicate detection indicators, spatial radius queries, and verification workflows. |
| [`operator-map.html`](operator/operator-map.html) | `/operator/map` | Desktop / High-Density | Full-canvas GIS tactical map visualizing stranded citizen markers, live vehicle/boat telemetry, relief shelter nodes, and active routing corridors. |
| [`operator-assignments.html`](operator/operator-assignments.html) | `/operator/assignments` | Desktop / High-Density | Optimization plan management workspace for triggering Phase 1 solvers (Nearest-First, Clarke-Wright, DBSCAN Cluster-Allocation, Google OR-Tools) and comparing proposal metrics. |
| [`operator-assignment-review.html`](operator/operator-assignment-review.html) | `/operator/assignments/[id]` | Desktop / High-Density | Granular assignment inspection view supporting stop sequencing, stop freeze controls, operator note entry, and ACID-locked commit transactions (`POST /assignments/:id/commit`). |

---

## Design System Specifications

- **Design Language:** Institutional Resilience & Civic Functionalism
- **Primary Color:** Deep Teal (`#005C55` / `#0F766E`) — represents safety, trust, and verified operational state
- **Emergency Accent:** Alert Red / Crimson (`#DC2626` / `#CF1B1E`) — strictly reserved for life-safety warnings and critical rescue priority
- **Warning Accent:** Amber (`#D97706` / `#F59E0B`) — denotes pending status, rising waters, or staging delays
- **Structural Neutral:** Slate / Navy (`#0F172A` / `#191C1E`) — navigation bars, administrative frames, high-contrast borders
- **Surface Canvas:** Soft Neutral (`#F7F9FB` / `#F8FAFC`) — anti-glare, eye-strain-reducing background for long shifts
- **Typography:**
  - Display / Headlines: **Manrope** (`wght: 600, 700, 800`)
  - Body & UI Controls: **Public Sans** (`wght: 400, 500, 600, 700`)
  - Operational & Monospace: **Inter** (`wght: 400, 500, 600, 700`)
- **Iconography:** Google **Material Symbols Outlined** (via Google Fonts CDN)
- **Styling Architecture:** Fully functional inline **Tailwind CSS v3** configurations embedded directly in each HTML file for zero-dependency local preview and inspection.

---

## Verification & Integrity Check

To verify file integrity against the recorded SHA-256 hashes, run:

```bash
# Linux / macOS / Git Bash
cd design/stitch && sha256sum -c SHA256SUMS.txt

# Windows PowerShell
cd design/stitch
Get-FileHash -Algorithm SHA256 citizen/*.html, operator/*.html | ForEach-Object {
    $rel = $_.Path.Replace((Get-Location).Path + "\", "").Replace("\", "/")
    "$($_.Hash.ToLower())  $rel"
}
```

---

## Next Steps for Phase 3 Implementation

These HTML prototypes provide the exact component hierarchy, styling tokens, and layout models to be componentized into the Phase 3 Next.js App Router workspace (`apps/web` or `apps/operator`):
1. Convert static forms into React Hook Form / Zod validated components wired to `POST /requests`.
2. Replace static map canvas in `operator-map.html` with dynamic **React-Leaflet** / **OpenStreetMap** layers querying PostGIS `GET /requests/nearby` and `GET /assignments`.
3. Connect assignment review actions in `operator-assignment-review.html` to `POST /assignments/:id/commit` and `PATCH /assignments/:id/stops/:stopId`.
