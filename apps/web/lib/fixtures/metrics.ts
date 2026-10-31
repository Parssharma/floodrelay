export interface DashboardMetrics {
  activeFleetCount: number;
  totalFleetCount: number;
  pendingRequestsCount: number;
  criticalRequestsCount: number;
  urgentRequestsCount: number;
  mediumRequestsCount: number;
  openSheltersCount: number;
  totalSheltersCount: number;
  shelterCapacityPercent: number;
  proposedPlanCoveragePercent: number;
  unservedRequestsCount: number;
  activeSectorName: string;
  waterGaugeCrestFeet: number;
  waterGaugeStatus: string;
}

export const SIMULATED_DASHBOARD_METRICS: DashboardMetrics = {
  activeFleetCount: 18,
  totalFleetCount: 22,
  pendingRequestsCount: 37,
  criticalRequestsCount: 9,
  urgentRequestsCount: 14,
  mediumRequestsCount: 14,
  openSheltersCount: 3,
  totalSheltersCount: 4,
  shelterCapacityPercent: 68,
  proposedPlanCoveragePercent: 94.2,
  unservedRequestsCount: 1,
  activeSectorName: 'Sector 4 — Buffalo Bayou & San Jacinto Basin',
  waterGaugeCrestFeet: 41.2,
  waterGaugeStatus: 'Minor Flood Stage (Crest Watch Active)',
};
