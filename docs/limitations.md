# Known Limitations

This file documents honest limitations of the system. Keep it updated as the project grows.

---

- **Demo rescue requests are simulated.** All demo and test requests are generated from seeded scripts and are labelled `SIMULATED`. They do not represent real incidents.

- **OSRM uses static map data.** OSRM does not know which roads are currently flooded. Operators mark blocked areas manually, and routes crossing them are flagged. This means routing may suggest paths through areas that are actually impassable until an operator marks them.

- **No live traffic.** Travel-time estimates do not account for real-time traffic conditions.

- **Results are from simulated scenarios.** All evaluation results are from simulated scenarios and are not field-validated. They should not be interpreted as guarantees of real-world performance.

- **TODO: A real Google OR-Tools baseline is not implemented yet.** The current baseline uses a pure TypeScript Clarke-Wright savings heuristic with 2-opt local search.

---

## Placeholder Constants & Model Assumptions

The current solver and travel time providers use placeholder constants (`ASSUMED_*`) for speed, detour, and flood impedance. These are heuristic placeholders rather than empirically validated field measurements:

- `ASSUMED_ROAD_DETOUR_FACTOR` (`1.3`): Multiplier applied to geodesic Haversine distance to approximate road network curvature in the absence of an active routing engine (OSRM).
- `ASSUMED_DEFAULT_SPEED_KMH` (`30` km/h): Baseline speed assumption for rescue vehicles when speed is not specified on the resource.
- `ASSUMED_FLOOD_IMPEDANCE_MULTIPLIER` (`1.0`): Baseline transit multiplier for waterlogged routes. Impeded routes scale travel time by multipliers greater than 1.0.
- `ASSUMED_BOAT_SPEED_MIN_KMH` (`20` km/h) & `ASSUMED_BOAT_SPEED_MAX_KMH` (`30` km/h): Assumed speed range for motorized inflatable rescue boats in inundated urban floodplains.
- `ASSUMED_TRUCK_SPEED_MIN_KMH` (`35` km/h) & `ASSUMED_TRUCK_SPEED_MAX_KMH` (`50` km/h): Assumed transit speed range for high-water rescue trucks over passable road segments.
