-- Migration 006 Down: Revert service area boundary attestation correction
-- Preserves the service_areas table and all existing requests while rolling back dataset_sha256 if explicitly requested.
UPDATE service_areas
SET dataset_sha256 = '357d77cdf69c8f5f4016c0c656e70cfcb8b1d585dcba5849e95a15299478fd1d',
    updated_at = NOW()
WHERE region_id = 'IN-NCR';

