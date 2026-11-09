'use client';

import { useState, useEffect, useRef } from 'react';
import type { RescueRequest } from '@floodrelay/shared';
import type { SelectedMapEntity } from '@/components/operator/map/LeafletMapCanvas';

export interface UseMapSelectionProps {
  requests: RescueRequest[];
  requestedId: string | null;
}

export function useMapSelection({ requests, requestedId }: UseMapSelectionProps) {
  const [selectedEntity, setSelectedEntity] = useState<SelectedMapEntity>(null);
  const focusedRequestIdRef = useRef<string | null>(null);
  const hasInitializedDefaultRef = useRef(false);

  useEffect(() => {
    if (requests.length === 0) return;

    // 1. If a requestId query param is specified and hasn't been focused yet
    if (requestedId && focusedRequestIdRef.current !== requestedId) {
      const target = requests.find((r) => r.id === requestedId);
      if (target) {
        focusedRequestIdRef.current = requestedId;
        setSelectedEntity({ type: 'incident', item: target });
        return;
      }
      // If target requestedId does not match any current request, mark focused so we don't repeatedly search
      focusedRequestIdRef.current = requestedId;
    }

    // 2. Default fallback selection when no requestedId query param is present
    if (!requestedId && !hasInitializedDefaultRef.current) {
      hasInitializedDefaultRef.current = true;
      const firstCritical = requests.find((r) => r.urgency === 'CRITICAL') || requests[0];
      if (firstCritical) {
        setSelectedEntity({ type: 'incident', item: firstCritical });
      }
    }
  }, [requests, requestedId]);

  return { selectedEntity, setSelectedEntity, focusedRequestIdRef, hasInitializedDefaultRef };
}
