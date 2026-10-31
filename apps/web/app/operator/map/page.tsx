'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import SimulatedNotice from '@/components/ui/SimulatedNotice';

interface MapMarker {
  id: string;
  type: 'incident' | 'vessel' | 'shelter' | 'depot';
  title: string;
  subtitle: string;
  urgency?: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  pax?: number;
  x: number; // percentage or px
  y: number;
  details?: {
    waterDepth?: string;
    hazard?: string;
    specialNeeds?: string;
    status?: string;
    speed?: string;
    heading?: string;
    capacityPercent?: number;
  };
}

const SIMULATED_MAP_MARKERS: MapMarker[] = [
  {
    id: 'req-fl-8824',
    type: 'incident',
    title: '#FL-8824',
    subtitle: '1428 Riverbend Dr',
    urgency: 'CRITICAL',
    pax: 4,
    x: 42,
    y: 48,
    details: {
      waterDepth: '+1.8m Inundation',
      hazard: 'Utility lines submerged 40m south. Tree canopy prevents air winch.',
      specialNeeds: '1 Oxygen Dependent (Respiratory failure risk)',
      status: 'Assigned to Boat Alpha-4',
    },
  },
  {
    id: 'req-fl-8819',
    type: 'incident',
    title: '#FL-8819',
    subtitle: '1510 Riverbend Dr',
    urgency: 'HIGH',
    pax: 2,
    x: 48,
    y: 44,
    details: {
      waterDepth: '+1.2m Inundation',
      hazard: 'Rising water in 1st floor; family on 2nd floor balcony.',
      specialNeeds: '1 Infant (formula needed)',
      status: 'Assigned (Stop 3)',
    },
  },
  {
    id: 'req-fl-8831',
    type: 'incident',
    title: '#FL-8831',
    subtitle: '2204 Bayou Oaks Ln',
    urgency: 'CRITICAL',
    pax: 3,
    x: 32,
    y: 32,
    details: {
      waterDepth: '+2.1m Inundation',
      hazard: 'Roof stranded, water touching fascia.',
      specialNeeds: 'Elderly occupant non-ambulatory',
      status: 'Unassigned Queue',
    },
  },
  {
    id: 'req-fl-8835',
    type: 'incident',
    title: '#FL-8835',
    subtitle: '810 Memorial Heights',
    urgency: 'HIGH',
    pax: 5,
    x: 58,
    y: 38,
    details: {
      waterDepth: '+0.9m Inundation',
      hazard: 'Crawlspace flooded, ground floor taking water.',
      specialNeeds: 'None reported',
      status: 'Unassigned Queue',
    },
  },
  {
    id: 'req-fl-8840',
    type: 'incident',
    title: '#FL-8840',
    subtitle: '1902 Greenspoint Mall',
    urgency: 'CRITICAL',
    pax: 6,
    x: 62,
    y: 58,
    details: {
      waterDepth: '+0.2m Shallow mud',
      hazard: 'Inaccessible by deep-v hull; requires high-water truck.',
      specialNeeds: '2 Children',
      status: 'Unserved Backlog',
    },
  },
  {
    id: 'craft-alpha-4',
    type: 'vessel',
    title: 'Boat Alpha-4',
    subtitle: 'Swift-Water Zodiac',
    pax: 0,
    x: 36,
    y: 51,
    details: {
      speed: '14 kts',
      heading: '052° True',
      status: 'EN ROUTE to #FL-8824',
    },
  },
  {
    id: 'craft-hawk-1',
    type: 'vessel',
    title: 'Rotary Hawk-1',
    subtitle: 'Aviation Rescue',
    pax: 0,
    x: 40,
    y: 22,
    details: {
      speed: '65 kts',
      heading: '180° South',
      status: 'Airborne Reconnaissance',
    },
  },
  {
    id: 'craft-hw-2',
    type: 'vessel',
    title: 'Truck Heavy-2',
    subtitle: 'High-Water Truck',
    pax: 0,
    x: 49,
    y: 65,
    details: {
      speed: '18 mph',
      heading: 'Eastbound I-10 Service Rd',
      status: 'En Route to Shelter Drop',
    },
  },
  {
    id: 'shelter-westchase',
    type: 'shelter',
    title: 'Westchase High Shelter',
    subtitle: 'Primary Intake Point',
    x: 74,
    y: 26,
    details: {
      capacityPercent: 41,
      status: 'Open - 142 beds remaining',
    },
  },
  {
    id: 'shelter-nrg',
    type: 'shelter',
    title: 'NRG Arena Shelter',
    subtitle: 'Secondary Evacuation Hub',
    x: 75,
    y: 68,
    details: {
      capacityPercent: 62,
      status: 'Open - 310 beds remaining',
    },
  },
  {
    id: 'depot-basin',
    type: 'depot',
    title: 'Houston Yacht Basin',
    subtitle: 'Staging Depot West',
    x: 26,
    y: 58,
    details: {
      status: 'Operational Base',
    },
  },
];

export default function OperatorMapPage() {
  const [layers, setLayers] = useState({
    incidents: true,
    craft: true,
    shelters: true,
    inundation: true,
    gauges: true,
  });

  const [urgencyFilter, setUrgencyFilter] = useState('ALL');
  const [vesselFilter, setVesselFilter] = useState('ALL');
  const [selectedMarker, setSelectedMarker] = useState<MapMarker>(SIMULATED_MAP_MARKERS[0]);
  const [activeTab, setActiveTab] = useState<'target' | 'manifest'>('target');
  const [zoomLevel, setZoomLevel] = useState(100);

  const toggleLayer = (layer: keyof typeof layers) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const filteredMarkers = SIMULATED_MAP_MARKERS.filter((marker) => {
    if (marker.type === 'incident' && !layers.incidents) return false;
    if (marker.type === 'vessel' && !layers.craft) return false;
    if (marker.type === 'shelter' && !layers.shelters) return false;
    if (marker.type === 'depot' && !layers.craft) return false;

    if (marker.type === 'incident' && urgencyFilter !== 'ALL') {
      if (urgencyFilter === 'CRITICAL' && marker.urgency !== 'CRITICAL') return false;
      if (urgencyFilter === 'HIGH' && marker.urgency !== 'HIGH') return false;
    }

    return true;
  });

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] relative overflow-hidden bg-[#0b1320] text-slate-100 select-none">
      {/* Top Banner Notice */}
      <div className="bg-slate-900/90 border-b border-slate-700/60 px-4 py-1.5 flex items-center justify-between text-xs z-30">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-teal-400 text-sm">radar</span>
          <span className="font-semibold text-slate-200">Sector 4 Geospatial Tactical Map</span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-300 font-mono">
            Buffalo Bayou Sub-basin Grid (29.7604° N, 95.3698° W)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <SimulatedNotice variant="pill" message="SIMULATED GEOSPATIAL DATA" />
          <span className="text-slate-400 font-mono">14:52:10 CDT</span>
        </div>
      </div>

      <div className="flex-1 relative flex overflow-hidden">
        {/* ========================================================================= */}
        {/* 1. MAP INTERACTIVE CANVAS                                                 */}
        {/* ========================================================================= */}
        <div className="flex-1 relative h-full overflow-hidden bg-[#0b1320]">
          {/* Top-left Floating Layer & Filter Controls */}
          <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 max-w-xl">
            {/* Layer Checkbox Group */}
            <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 p-2 rounded-lg shadow-lg flex items-center gap-2 flex-wrap text-xs">
              <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-950/40 border border-red-500/40 text-slate-100 cursor-pointer hover:bg-red-900/40 transition-colors">
                <input
                  type="checkbox"
                  checked={layers.incidents}
                  onChange={() => toggleLayer('incidents')}
                  className="rounded text-red-500 focus:ring-0 w-3.5 h-3.5 bg-transparent border-red-400 cursor-pointer"
                />
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-medium">Incidents</span>
                <span className="ml-0.5 px-1 rounded bg-red-600 text-white font-mono text-[10px]">
                  37
                </span>
              </label>

              <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-teal-950/40 border border-teal-500/40 text-slate-100 cursor-pointer hover:bg-teal-900/40 transition-colors">
                <input
                  type="checkbox"
                  checked={layers.craft}
                  onChange={() => toggleLayer('craft')}
                  className="rounded text-teal-400 focus:ring-0 w-3.5 h-3.5 bg-transparent border-teal-400 cursor-pointer"
                />
                <span className="material-symbols-outlined text-[13px] text-teal-400">sailing</span>
                <span className="font-medium">Active Craft</span>
                <span className="ml-0.5 px-1 rounded bg-teal-600 text-white font-mono text-[10px]">
                  24
                </span>
              </label>

              <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/80 border border-slate-600/60 text-slate-100 cursor-pointer hover:bg-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={layers.shelters}
                  onChange={() => toggleLayer('shelters')}
                  className="rounded text-teal-400 focus:ring-0 w-3.5 h-3.5 bg-transparent border-slate-400 cursor-pointer"
                />
                <span className="material-symbols-outlined text-[13px] text-slate-300">
                  night_shelter
                </span>
                <span className="font-medium">Shelters</span>
                <span className="ml-0.5 px-1 rounded bg-slate-600 text-white font-mono text-[10px]">
                  6
                </span>
              </label>

              <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/80 border border-slate-600/60 text-slate-100 cursor-pointer hover:bg-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={layers.inundation}
                  onChange={() => toggleLayer('inundation')}
                  className="rounded text-teal-400 focus:ring-0 w-3.5 h-3.5 bg-transparent border-slate-400 cursor-pointer"
                />
                <span className="material-symbols-outlined text-[13px] text-teal-400">waves</span>
                <span className="font-medium">FEMA Inundation</span>
              </label>

              <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/80 border border-slate-600/60 text-slate-100 cursor-pointer hover:bg-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={layers.gauges}
                  onChange={() => toggleLayer('gauges')}
                  className="rounded text-teal-400 focus:ring-0 w-3.5 h-3.5 bg-transparent border-slate-400 cursor-pointer"
                />
                <span className="material-symbols-outlined text-[13px] text-teal-400">sensors</span>
                <span className="font-medium">USGS Gauges</span>
              </label>
            </div>

            {/* Filter Dropdowns */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs shadow">
                <span className="text-slate-400 mr-1.5 font-mono text-[11px]">URGENCY:</span>
                <select
                  value={urgencyFilter}
                  onChange={(e) => setUrgencyFilter(e.target.value)}
                  className="bg-transparent text-slate-200 border-0 p-0 pr-4 text-xs font-semibold focus:ring-0 cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-900 text-slate-100">
                    All Tiers (Critical + High)
                  </option>
                  <option value="CRITICAL" className="bg-slate-900 text-slate-100">
                    Tier 1: Critical Only
                  </option>
                  <option value="HIGH" className="bg-slate-900 text-slate-100">
                    Tier 2: Urgent Only
                  </option>
                </select>
              </div>

              <div className="flex items-center bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs shadow">
                <span className="text-slate-400 mr-1.5 font-mono text-[11px]">VESSEL:</span>
                <select
                  value={vesselFilter}
                  onChange={(e) => setVesselFilter(e.target.value)}
                  className="bg-transparent text-slate-200 border-0 p-0 pr-4 text-xs font-semibold focus:ring-0 cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-900 text-slate-100">
                    All Fleet Craft
                  </option>
                  <option value="ZODIAC" className="bg-slate-900 text-slate-100">
                    Swift-Water Zodiac
                  </option>
                  <option value="AIRBOAT" className="bg-slate-900 text-slate-100">
                    Airboat Heavy
                  </option>
                  <option value="TRUCK" className="bg-slate-900 text-slate-100">
                    High-Water Truck
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* Top Center Straight-Line Transit Disclaimer */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none max-w-md hidden md:block">
            <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-3 py-1 rounded-lg shadow-md flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-sm flex-shrink-0">
                info
              </span>
              <p className="text-[11px] text-slate-300 leading-tight">
                <strong className="text-amber-300 font-semibold">
                  Straight-line transit vectors shown.
                </strong>{' '}
                Surface road flooding precludes standard routing; watercraft follow navigable
                channels.
              </p>
            </div>
          </div>

          {/* Top Right Floating Map Navigation Tools */}
          <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
            <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-lg shadow-md flex flex-col p-1 gap-1">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(160, z + 15))}
                className="w-8 h-8 rounded flex items-center justify-center hover:bg-slate-800 text-slate-200 transition-colors"
                title="Zoom In"
              >
                <span className="material-symbols-outlined text-base">add</span>
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(70, z - 15))}
                className="w-8 h-8 rounded flex items-center justify-center hover:bg-slate-800 text-slate-200 transition-colors"
                title="Zoom Out"
              >
                <span className="material-symbols-outlined text-base">remove</span>
              </button>
              <div className="h-px bg-slate-700 my-0.5" />
              <button
                type="button"
                onClick={() => {
                  setSelectedMarker(SIMULATED_MAP_MARKERS[0]);
                  setZoomLevel(100);
                }}
                className="w-8 h-8 rounded flex items-center justify-center hover:bg-slate-800 text-red-400 transition-colors"
                title="Center on Critical Cluster (#FL-8824)"
              >
                <span className="material-symbols-outlined text-base">center_focus_strong</span>
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(100)}
                className="w-8 h-8 rounded flex items-center justify-center hover:bg-slate-800 text-teal-400 transition-colors"
                title="Reset Sector View"
              >
                <span className="material-symbols-outlined text-base">crop_free</span>
              </button>
            </div>

            {/* Compass HUD */}
            <div className="w-9 h-9 rounded-full bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-md flex items-center justify-center self-center text-slate-300 font-mono text-[11px] font-bold relative">
              <span className="text-[9px] text-red-400 absolute top-0.5 font-bold">N</span>
              <span className="material-symbols-outlined text-xs rotate-45 text-slate-400">
                navigation
              </span>
            </div>
          </div>

          {/* Map Vector Graphic (SVG GIS Layer) */}
          <div
            className="absolute inset-0 w-full h-full transition-transform duration-300 origin-center"
            style={{ transform: `scale(${zoomLevel / 100})` }}
          >
            <svg className="w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="floodGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path
                    d="M 40 0 L 0 0 0 40"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.05)"
                    strokeWidth="1"
                  />
                </pattern>
                <pattern
                  id="floodStripes"
                  width="16"
                  height="16"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="16"
                    stroke="#0f766e"
                    strokeWidth="4"
                    strokeOpacity="0.3"
                  />
                </pattern>
                <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Grid Background */}
              <rect width="100%" height="100%" fill="url(#floodGrid)" />

              {/* Highway & Arterial Street Grid */}
              <g fill="none" stroke="#1e2d42" strokeWidth="2">
                <line x1="0" y1="120" x2="1400" y2="150" />
                <line x1="0" y1="380" x2="1400" y2="410" />
                <line x1="0" y1="620" x2="1400" y2="600" />
                <line x1="300" y1="0" x2="340" y2="900" />
                <line x1="680" y1="0" x2="660" y2="900" />
                <line x1="1020" y1="0" x2="1050" y2="900" />
              </g>

              {/* Secondary Road Network */}
              <g fill="none" stroke="#15202e" strokeWidth="1">
                <line x1="150" y1="0" x2="150" y2="900" strokeDasharray="3,3" />
                <line x1="480" y1="0" x2="480" y2="900" strokeDasharray="3,3" />
                <line x1="840" y1="0" x2="840" y2="900" strokeDasharray="3,3" />
                <line x1="0" y1="240" x2="1400" y2="240" strokeDasharray="3,3" />
                <line x1="0" y1="500" x2="1400" y2="500" strokeDasharray="3,3" />
              </g>

              {/* Inundation Zones (FEMA Overlays) */}
              {layers.inundation && (
                <g>
                  <path
                    d="M 380,380 C 480,360 620,410 700,430 C 780,450 760,550 620,580 C 480,610 330,540 340,440 Z"
                    fill="url(#floodStripes)"
                    stroke="#0f766e"
                    strokeWidth="1.5"
                    strokeDasharray="4,4"
                  />
                  <path
                    d="M 780,320 C 880,310 990,340 1040,400 C 1080,460 1020,520 930,510 C 850,500 760,420 780,320 Z"
                    fill="url(#floodStripes)"
                    stroke="#0f766e"
                    strokeWidth="1.5"
                    strokeDasharray="4,4"
                  />
                </g>
              )}

              {/* Waterways: Buffalo Bayou Primary Channel */}
              <path
                d="M -50,480 C 220,470 380,530 550,490 C 720,450 880,490 1050,440 C 1150,410 1350,420 1450,430"
                fill="none"
                stroke="#004d47"
                strokeWidth="24"
                strokeLinecap="round"
                opacity="0.6"
              />
              <path
                d="M -50,480 C 220,470 380,530 550,490 C 720,450 880,490 1050,440 C 1150,410 1350,420 1450,430"
                fill="none"
                stroke="#007a71"
                strokeWidth="10"
                strokeLinecap="round"
                opacity="0.9"
              />

              {/* San Jacinto Branch */}
              <path
                d="M 620,0 C 630,180 590,280 550,490"
                fill="none"
                stroke="#004d47"
                strokeWidth="16"
                strokeLinecap="round"
                opacity="0.5"
              />
              <path
                d="M 620,0 C 630,180 590,280 550,490"
                fill="none"
                stroke="#007a71"
                strokeWidth="6"
                strokeLinecap="round"
                opacity="0.8"
              />

              {/* VRP Dispatch Route Vector (Boat Alpha-4 Transit Vector) */}
              {/* Depot (26%, 58%) -> Alpha-4 (36%, 51%) -> #FL-8824 (42%, 48%) -> #FL-8819 (48%, 44%) -> Westchase High (74%, 26%) */}
              <g strokeLinecap="round" strokeLinejoin="round">
                <polyline
                  points="260,522 360,459 420,432 480,396 740,234"
                  fill="none"
                  stroke="#80d5cb"
                  strokeWidth="4"
                  strokeOpacity="0.4"
                  filter="url(#routeGlow)"
                />
                <polyline
                  points="260,522 360,459 420,432 480,396 740,234"
                  fill="none"
                  stroke="#9cf2e8"
                  strokeWidth="2"
                  strokeDasharray="6,4"
                />
              </g>
            </svg>

            {/* Interactive Markers Layer */}
            {filteredMarkers.map((marker) => {
              const isSelected = selectedMarker.id === marker.id;

              return (
                <div
                  key={marker.id}
                  onClick={() => setSelectedMarker(marker)}
                  style={{
                    left: `${marker.x}%`,
                    top: `${marker.y}%`,
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 transition-transform ${
                    isSelected ? 'scale-110 z-20' : 'hover:scale-105'
                  }`}
                >
                  {/* Marker Icon Rendering */}
                  {marker.type === 'incident' && (
                    <div className="relative flex items-center justify-center">
                      {marker.urgency === 'CRITICAL' && (
                        <span className="absolute h-8 w-8 rounded-full bg-red-500 opacity-75 animate-ping" />
                      )}
                      <div
                        className={`h-7 w-7 rounded-full flex items-center justify-center border-2 border-white shadow-lg text-white font-bold text-xs ${
                          marker.urgency === 'CRITICAL'
                            ? 'bg-red-600 ring-2 ring-red-400'
                            : 'bg-amber-600'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px]">
                          {marker.urgency === 'CRITICAL' ? 'e911_emergency' : 'priority_high'}
                        </span>
                      </div>
                    </div>
                  )}

                  {marker.type === 'vessel' && (
                    <div className="relative flex items-center justify-center">
                      <div className="h-7 w-7 rounded-lg bg-teal-700 text-teal-100 border-2 border-white shadow-md flex items-center justify-center rotate-45">
                        <span className="material-symbols-outlined text-[15px] -rotate-45">
                          sailing
                        </span>
                      </div>
                    </div>
                  )}

                  {marker.type === 'shelter' && (
                    <div className="flex items-center gap-1.5 bg-slate-900/95 backdrop-blur-md border border-teal-500/60 px-2 py-1 rounded-lg shadow-md text-xs">
                      <span className="material-symbols-outlined text-teal-400 text-[15px]">
                        night_shelter
                      </span>
                      <div>
                        <div className="font-semibold text-slate-100 whitespace-nowrap text-[11px]">
                          {marker.title}
                        </div>
                        <div className="text-[10px] text-teal-300 font-mono">
                          Drop-off [{marker.details?.capacityPercent ?? 50}% Cap]
                        </div>
                      </div>
                    </div>
                  )}

                  {marker.type === 'depot' && (
                    <div className="h-6 w-6 rounded-full bg-slate-700 text-slate-200 border-2 border-white shadow flex items-center justify-center">
                      <span className="material-symbols-outlined text-[13px]">anchor</span>
                    </div>
                  )}

                  {/* Marker Tooltip / Callout Tag */}
                  {(isSelected || marker.type === 'incident') && marker.type !== 'shelter' && (
                    <div
                      className={`absolute left-1/2 -translate-x-1/2 bottom-8 px-2 py-0.5 rounded shadow-lg text-[10px] font-mono whitespace-nowrap pointer-events-none border ${
                        isSelected
                          ? 'bg-slate-900 text-white border-teal-400 ring-1 ring-teal-400'
                          : 'bg-slate-900/80 text-slate-200 border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1 font-semibold">
                        {marker.urgency === 'CRITICAL' && (
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        )}
                        {marker.title} ({marker.subtitle})
                      </div>
                      {marker.pax !== undefined && (
                        <div className="text-[9px] text-slate-400">
                          {marker.pax} Pax • {marker.details?.waterDepth ?? 'Flood Zone'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Floating Map Scale & Live Telemetry Gauge */}
          <div className="absolute bottom-3 left-3 z-20 flex items-center gap-3">
            {/* Scale Bar HUD */}
            <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-2.5 py-1 rounded-lg shadow text-xs font-mono flex flex-col gap-0.5">
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>0</span>
                <span>0.8</span>
                <span>1.6 km / 1.0 mi</span>
              </div>
              <div className="w-24 h-1 bg-slate-700 flex">
                <div className="w-1/2 bg-slate-300" />
                <div className="w-1/2 bg-slate-600" />
              </div>
            </div>

            {/* USGS Gauge HUD */}
            {layers.gauges && (
              <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-2.5 py-1 rounded-lg shadow text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-teal-400 text-sm">water_full</span>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-mono">
                    USGS #08074000 Buffalo Bayou
                  </div>
                  <div className="font-bold text-slate-200 text-[11px]">
                    Flow: 9,420 cfs <span className="text-red-400 font-semibold">(+12% in 2h)</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Floating Map Legend */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 hidden md:block">
            <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 px-3 py-1.5 rounded-lg shadow-md flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
                <span className="text-slate-300 text-[11px]">Critical (Roof Stranded)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />
                <span className="text-slate-300 text-[11px]">Urgent (Inflow)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-teal-400 text-xs">sailing</span>
                <span className="text-slate-300 text-[11px]">Rescue Craft</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-teal-400 text-xs">
                  night_shelter
                </span>
                <span className="text-slate-300 text-[11px]">Safe Shelter</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm border border-teal-500 bg-teal-900/40 inline-block" />
                <span className="text-slate-300 text-[11px]">FEMA Inundation</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. RIGHT-SIDE TACTICAL INSPECTION PANEL                                   */}
        {/* ========================================================================= */}
        <aside className="w-80 sm:w-96 h-full bg-white text-slate-900 border-l border-slate-200 flex flex-col z-20 shadow-xl overflow-hidden">
          {/* Panel Header */}
          <div className="border-b border-slate-200 bg-slate-50 px-4 pt-3 pb-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-teal-700 text-base">radar</span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Tactical Inspection
                </span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                Sector 4-B
              </span>
            </div>

            {/* Segmented Tab Bar */}
            <div className="flex gap-4 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('target')}
                className={`pb-2 border-b-2 flex items-center gap-1 transition-colors ${
                  activeTab === 'target'
                    ? 'border-teal-700 text-teal-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="material-symbols-outlined text-sm">location_on</span>
                <span>Selected Target</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('manifest')}
                className={`pb-2 border-b-2 flex items-center gap-1 transition-colors ${
                  activeTab === 'manifest'
                    ? 'border-teal-700 text-teal-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="material-symbols-outlined text-sm">route</span>
                <span>Route Manifest (Alpha-4)</span>
              </button>
            </div>
          </div>

          {/* Panel Content Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === 'target' ? (
              <>
                {/* Target Incident Overview Card */}
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            selectedMarker.urgency === 'CRITICAL'
                              ? 'bg-red-100 text-red-800 border border-red-300'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}
                        >
                          {selectedMarker.urgency ?? selectedMarker.type.toUpperCase()}
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          ID: {selectedMarker.title}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 mt-1">
                        {selectedMarker.subtitle}
                      </h3>
                      <p className="text-xs text-slate-600">
                        Buffalo Bayou Flood Basin • Sector 4-B
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-teal-800 block">
                        {selectedMarker.details?.waterDepth ?? '1.8m Inundation'}
                      </span>
                      <span className="text-[10px] text-slate-500">Submerged eave</span>
                    </div>
                  </div>

                  {/* Occupant Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2 bg-white p-2.5 rounded border border-slate-200 text-center">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">
                        Occupants
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {selectedMarker.pax ?? 4} Persons
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">
                        Medical Need
                      </span>
                      <span className="text-xs font-bold text-red-700">1 O2 Dep.</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">
                        Structure
                      </span>
                      <span className="text-xs font-bold text-slate-800">Roof Perch</span>
                    </div>
                  </div>

                  {/* Tactical Field Notes */}
                  <div className="p-2.5 rounded bg-amber-50/60 border border-amber-200/80 text-xs">
                    <p className="font-semibold text-amber-900 flex items-center gap-1 mb-1">
                      <span className="material-symbols-outlined text-sm text-amber-700">
                        warning
                      </span>
                      HAZARDS &amp; ACCESS RESTRICTIONS:
                    </p>
                    <p className="text-slate-700 text-[11px] leading-relaxed">
                      {selectedMarker.details?.hazard ??
                        'High-voltage utility lines submerged 40m south. Tree canopy prevents direct helicopter winch. Zodiac swift-water craft required with auxiliary O2 kit.'}
                    </p>
                  </div>

                  {/* Dispatched Asset Quick Status */}
                  <div className="flex items-center justify-between p-2.5 rounded bg-teal-50 border border-teal-200">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-teal-700 text-lg">
                        sailing
                      </span>
                      <div>
                        <p className="text-xs text-slate-900 font-semibold">
                          Boat Alpha-4 Assigned
                        </p>
                        <p className="text-[11px] text-teal-800 font-mono">
                          1.4 NM away • Bearing 052°
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-teal-800">~18 MIN</span>
                      <span className="text-[10px] text-slate-500 block">Estimated ETA</span>
                    </div>
                  </div>
                </div>

                {/* Milestone 1 Disclaimer Notice */}
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
                  <p className="font-semibold flex items-center gap-1 mb-0.5">
                    <span className="material-symbols-outlined text-sm">info</span>
                    Milestone 1 Map Preview
                  </p>
                  <p className="text-[11px] text-blue-800 leading-normal">
                    Real-time GPS tracker telemetry connects in Milestone 4. Map-based manual stop
                    reassignments connect in Milestone 5.
                  </p>
                </div>
              </>
            ) : (
              /* Route Manifest Stop Sequence */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-teal-700">
                      alt_route
                    </span>
                    Solver Route: Boat Alpha-4
                  </h4>
                  <span className="text-[10px] font-mono text-teal-800 bg-teal-100 px-1.5 py-0.5 rounded font-semibold">
                    VRP Plan #PR-105
                  </span>
                </div>

                {/* Linear Stop Sequence Timeline */}
                <div className="border border-slate-200 rounded-lg bg-slate-50 divide-y divide-slate-200 text-xs">
                  {/* Stop 1: Origin */}
                  <div className="p-2.5 flex items-start gap-2.5">
                    <span className="h-5 w-5 rounded-full bg-slate-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      1
                    </span>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-slate-900">
                          Houston Yacht Basin Launch
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          14:15 [DEPARTED]
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Depot Staging • Fuel + Medic onboard
                      </p>
                    </div>
                  </div>

                  {/* Stop 2: FL-8824 */}
                  <div className="p-2.5 flex items-start gap-2.5 bg-teal-50/60">
                    <span className="h-5 w-5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      2
                    </span>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-slate-900">
                          1428 Riverbend Dr (#FL-8824)
                        </span>
                        <span className="text-[10px] font-bold text-teal-800">ETA 14:48</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-bold font-mono">
                          4 PAX PICKUP
                        </span>
                        <span className="text-[10px] text-red-700 font-semibold">O2 Kit ready</span>
                      </div>
                    </div>
                  </div>

                  {/* Stop 3: FL-8819 */}
                  <div className="p-2.5 flex items-start gap-2.5">
                    <span className="h-5 w-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      3
                    </span>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-slate-900">
                          1510 Riverbend Dr (#FL-8819)
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">ETA 15:02</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-mono">
                          2 PAX PICKUP
                        </span>
                        <span className="text-[10px] text-slate-600">2nd Floor Balcony</span>
                      </div>
                    </div>
                  </div>

                  {/* Stop 4: Westchase High Shelter */}
                  <div className="p-2.5 flex items-start gap-2.5">
                    <span className="h-5 w-5 rounded-full bg-teal-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      4
                    </span>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-slate-900">Westchase High Shelter</span>
                        <span className="text-[10px] font-mono text-slate-500">ETA 15:28</span>
                      </div>
                      <p className="text-[11px] text-teal-800 font-semibold mt-0.5">
                        Drop-off: 6 Pax Total Offload
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Panel Footer Actions */}
          <div className="p-3 border-t border-slate-200 bg-slate-50 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled
                className="h-8 px-2 rounded border border-slate-300 text-slate-400 text-xs font-semibold flex items-center justify-center gap-1 cursor-not-allowed bg-slate-100"
                title="Dynamic stop reordering connects in Milestone 5"
              >
                <span className="material-symbols-outlined text-sm">edit_calendar</span>
                <span>Re-assign (M5)</span>
              </button>
              <button
                type="button"
                disabled
                className="h-8 px-2 rounded bg-teal-800 text-teal-200 text-xs font-semibold flex items-center justify-center gap-1 opacity-70 cursor-not-allowed"
                title="Radio dispatch connects in Milestone 5"
              >
                <span className="material-symbols-outlined text-sm">radio</span>
                <span>Radio Vector</span>
              </button>
            </div>
            <Link
              href="/operator/assignments/PR-105"
              className="w-full h-8 rounded bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">assignment</span>
              <span>Review Full Assignment Plan</span>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
