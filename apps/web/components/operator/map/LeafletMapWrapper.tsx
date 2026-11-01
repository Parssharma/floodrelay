'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import type { RescueRequest } from '@floodrelay/shared';
import type { AssignmentRecord } from '@/lib/api/types';
import type { StagedAsset, StagedShelter, SelectedMapEntity } from './LeafletMapCanvas';

const LeafletMapCanvas = dynamic(() => import('./LeafletMapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#0b1320] flex flex-col items-center justify-center p-6 text-slate-300 font-inter">
      <div className="w-12 h-12 border-4 border-teal-500/20 border-t-teal-400 rounded-full animate-spin mb-4" />
      <div className="text-sm font-bold font-mono text-teal-300 tracking-wider">
        INITIALIZING GEOSPATIAL MAP ENGINE...
      </div>
      <div className="text-xs text-slate-400 font-mono mt-1">
        Loading OpenStreetMap vector tiles and PostGIS coordinate projection
      </div>
    </div>
  ),
});

interface LeafletMapWrapperProps {
  requests: RescueRequest[];
  stagedFleet: StagedAsset[];
  stagedShelters: StagedShelter[];
  selectedAssignment: AssignmentRecord | null;
  layers: {
    incidents: boolean;
    craft: boolean;
    shelters: boolean;
    routes: boolean;
  };
  urgencyFilter: string;
  selectedEntity: SelectedMapEntity;
  onSelectEntity: (entity: SelectedMapEntity) => void;
  tileTheme: 'dark' | 'standard';
  actionTrigger?: { type: 'fit' | 'center-critical' | 'zoom-in' | 'zoom-out'; id: number } | null;
}

export default function LeafletMapWrapper(props: LeafletMapWrapperProps) {
  return <LeafletMapCanvas {...props} />;
}
