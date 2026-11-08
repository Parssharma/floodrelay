export interface RepairClassification {
  category:
    | 'PROPOSED_VERIFIED'
    | 'PROPOSED_UNVERIFIED'
    | 'NO_FEASIBLE'
    | 'VERSION_CONFLICT'
    | 'UNAVAILABLE'
    | 'SKIPPED_NO_EVENT'
    | 'UNEXPECTED_FAILURE';
  proposalId: string | null;
  isFrozenPreserved: boolean;
  isUncommitted: boolean;
  errorDetail?: string;
}

export function classifyRepairOutcome(
  repairRes: { status: number; body?: string | object | null } | null,
  verifyRes?: { status: number; body?: string | object | null } | null,
): RepairClassification;
