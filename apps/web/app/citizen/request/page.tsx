'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { UrgencyLevel } from '@floodrelay/shared';

export default function CitizenRequestPage() {
  // Form State
  const [lat, setLat] = useState<string>('29.7604');
  const [lng, setLng] = useState<string>('-95.3698');
  const [gpsStatus, setGpsStatus] = useState<'IDLE' | 'ACQUIRED'>('ACQUIRED');
  const [address, setAddress] = useState<string>(
    '1428 Riverbend Dr, 2nd Floor Apt 3B, near Water Tower',
  );
  const [waterLevel, setWaterLevel] = useState<string>('ground_floor');
  const [partyCount, setPartyCount] = useState<number>(3);
  const [specialNeeds, setSpecialNeeds] = useState<Record<string, boolean>>({
    elderlyChildren: true,
    mobilityImpaired: false,
    medicalOxygen: false,
    pets: true,
  });
  const [urgency, setUrgency] = useState<UrgencyLevel>('HIGH');
  const [notes, setNotes] = useState<string>('');

  // Validation & Submission State
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submittedDevMode, setSubmittedDevMode] = useState<boolean>(false);

  const handleUseLocation = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(pos.coords.latitude.toFixed(6));
          setLng(pos.coords.longitude.toFixed(6));
          setGpsStatus('ACQUIRED');
        },
        () => {
          // Fallback to simulated location if permission denied
          setLat('29.7604');
          setLng('-95.3698');
          setGpsStatus('ACQUIRED');
        },
      );
    } else {
      setLat('29.7604');
      setLng('-95.3698');
      setGpsStatus('ACQUIRED');
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      newErrors.lat = 'Valid latitude between -90 and 90 is required';
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      newErrors.lng = 'Valid longitude between -180 and 180 is required';
    }
    if (!address.trim()) {
      newErrors.address = 'Street address or location landmark is required';
    }
    if (!waterLevel) {
      newErrors.waterLevel = 'Please select the current water level situation';
    }
    if (partyCount < 1) {
      newErrors.partyCount = 'At least 1 person must be reported';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setSubmittedDevMode(true);
    }
  };

  return (
    <div className="flex-1 flex flex-col pb-16">
      {/* Offline Resilient Connectivity Notification Banner */}
      <aside className="bg-surface-container-high border-b border-outline-variant px-4 py-2.5 text-on-surface">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 text-xs md:text-sm">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
            <span className="font-semibold text-on-surface-variant">Intake Status:</span>
            <span className="text-on-surface">
              Low-bandwidth protocol active. High-priority dispatch connection ready.
            </span>
          </div>
          <span className="hidden md:inline font-mono text-[11px] font-bold text-primary uppercase bg-surface px-2 py-0.5 rounded border border-outline-variant">
            Phase 3 • M1 Prototype
          </span>
        </div>
      </aside>

      {/* Main Content Layout */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 md:px-8 py-6 md:py-10">
        {/* Header Breadcrumb & Title */}
        <div className="mb-8">
          <Link
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline mb-3"
            href="/citizen"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span>Back to Home</span>
          </Link>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary-container text-on-secondary-fixed mb-3 ml-3 text-xs font-mono font-bold uppercase">
            <span className="material-symbols-outlined text-xs">verified_user</span>
            <span>Civil Defense Dispatch Tier-1</span>
          </div>
          <h1 className="font-manrope text-2xl md:text-4xl font-bold text-on-surface tracking-tight mb-2">
            Request Flood Rescue Assistance
          </h1>
          <p className="text-sm md:text-base text-on-surface-variant max-w-2xl leading-relaxed">
            Complete this form to alert active emergency dispatch teams. Please provide as precise a
            location as possible.
          </p>
        </div>

        {/* Milestone 1 Development Boundary Notice */}
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-700 text-lg mt-0.5">info</span>
          <div>
            <strong className="block text-amber-900 font-bold uppercase tracking-wider mb-0.5 font-mono">
              Milestone 1 UI Verification Mode
            </strong>
            <span>
              This form demonstrates complete client-side controls, validation foundations, and
              reactive state. Live server persistence and Express API transmission activate in{' '}
              <strong>Milestone 2</strong>.
            </span>
          </div>
        </div>

        {/* Form Interface */}
        <form className="space-y-8" onSubmit={handleSubmit}>
          {/* Section 1: Location Intake */}
          <fieldset className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 md:p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-surface-variant">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">pin_drop</span>
                <h2 className="font-manrope text-lg text-on-surface font-semibold">
                  1. Incident Location
                </h2>
              </div>
              <span className="font-mono text-xs uppercase font-bold bg-surface-container px-2 py-0.5 rounded text-on-surface-variant">
                Required
              </span>
            </div>

            {/* GPS Locator Module */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <button
                  className="flex items-center justify-center gap-2 bg-primary-container text-on-primary px-4 py-3 rounded-lg text-sm font-semibold hover:bg-primary transition-colors shadow-sm active:scale-95"
                  onClick={handleUseLocation}
                  type="button"
                >
                  <span className="material-symbols-outlined text-lg">satellite_alt</span>
                  <span>Use My Current Location</span>
                </button>
                <div className="flex items-center gap-2 px-3 py-2 bg-surface-container rounded-lg border border-outline-variant text-on-surface-variant text-xs font-medium">
                  <span
                    className={`w-2 h-2 rounded-full inline-block ${
                      gpsStatus === 'ACQUIRED' ? 'bg-emerald-600' : 'bg-amber-600'
                    }`}
                  />
                  <span>
                    {gpsStatus === 'ACQUIRED'
                      ? 'Location Acquired: Accuracy ±5m'
                      : 'Tap to fetch device coordinates'}
                  </span>
                </div>
              </div>

              {/* Coordinates Readout */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-surface rounded-lg border border-outline-variant">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      className="text-xs font-semibold text-on-surface-variant"
                      htmlFor="latInput"
                    >
                      Latitude
                    </label>
                    <span className="font-mono text-[10px] text-primary font-bold uppercase">
                      GPS Coordinate
                    </span>
                  </div>
                  <input
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                    id="latInput"
                    onChange={(e) => setLat(e.target.value)}
                    type="text"
                    value={lat}
                  />
                  {errors.lat && <p className="text-xs text-red-600 mt-1">{errors.lat}</p>}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      className="text-xs font-semibold text-on-surface-variant"
                      htmlFor="lngInput"
                    >
                      Longitude
                    </label>
                    <span className="font-mono text-[10px] text-primary font-bold uppercase">
                      GPS Coordinate
                    </span>
                  </div>
                  <input
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                    id="lngInput"
                    onChange={(e) => setLng(e.target.value)}
                    type="text"
                    value={lng}
                  />
                  {errors.lng && <p className="text-xs text-red-600 mt-1">{errors.lng}</p>}
                </div>
              </div>
            </div>

            {/* Street Address / Landmark */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-on-surface" htmlFor="addressInput">
                Street Address / Apartment / Structural Landmark{' '}
                <span className="text-tertiary">*</span>
              </label>
              <input
                className="w-full h-12 px-3.5 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary"
                id="addressInput"
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g., 1428 Riverbend Dr, 2nd Floor Apt 3B, near Water Tower"
                type="text"
                value={address}
              />
              {errors.address && <p className="text-xs text-red-600 mt-1">{errors.address}</p>}
              <p className="text-xs text-on-surface-variant">
                Include floor level, color of exterior walls, or high visibility markers for air and
                boat crews.
              </p>
            </div>

            {/* Water Depth Context */}
            <div className="space-y-1.5">
              <label
                className="block text-sm font-semibold text-on-surface"
                htmlFor="waterLevelInput"
              >
                Water level relative to your position <span className="text-tertiary">*</span>
              </label>
              <select
                className="w-full h-12 px-3.5 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                id="waterLevelInput"
                onChange={(e) => setWaterLevel(e.target.value)}
                value={waterLevel}
              >
                <option value="">Select current flood situation...</option>
                <option value="ankle_knee">
                  Ankle to Knee-deep in yard / driveway (Evacuation possible)
                </option>
                <option value="ground_floor">Reached ground floor interior (1 - 3 feet)</option>
                <option value="submerged_ground">
                  Ground floor fully submerged (Trapped on 2nd story)
                </option>
                <option value="roof_access">
                  Attic or Roof access only (Critical water crest)
                </option>
                <option value="surrounded">House dry on hill but surrounded by swift water</option>
              </select>
              {errors.waterLevel && (
                <p className="text-xs text-red-600 mt-1">{errors.waterLevel}</p>
              )}
            </div>
          </fieldset>

          {/* Section 2: Party Information */}
          <fieldset className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 md:p-6 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-surface-variant">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">group</span>
                <h2 className="font-manrope text-lg text-on-surface font-semibold">
                  2. Party Information
                </h2>
              </div>
              <span className="font-mono text-xs uppercase font-bold bg-surface-container px-2 py-0.5 rounded text-on-surface-variant">
                Occupants
              </span>
            </div>

            {/* Stepper: People Requiring Rescue */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-surface border border-outline-variant">
              <div>
                <div className="text-sm font-bold text-on-surface">
                  Number of people requiring rescue
                </div>
                <div className="text-xs text-on-surface-variant">
                  Boat capacity triage depends on total head count.
                </div>
              </div>
              <div className="flex items-center space-x-3 self-start sm:self-auto">
                <button
                  aria-label="Decrease party size"
                  className="w-12 h-12 flex items-center justify-center rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface hover:bg-surface-container active:scale-95 transition-all text-xl font-bold"
                  onClick={() => setPartyCount((prev) => Math.max(1, prev - 1))}
                  type="button"
                >
                  <span className="material-symbols-outlined">remove</span>
                </button>
                <span className="w-12 text-center font-manrope text-xl font-bold text-on-surface">
                  {partyCount}
                </span>
                <button
                  aria-label="Increase party size"
                  className="w-12 h-12 flex items-center justify-center rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface hover:bg-surface-container active:scale-95 transition-all text-xl font-bold"
                  onClick={() => setPartyCount((prev) => Math.min(20, prev + 1))}
                  type="button"
                >
                  <span className="material-symbols-outlined">add</span>
                </button>
              </div>
            </div>

            {/* Special Circumstances */}
            <div className="space-y-3">
              <div className="text-sm font-semibold text-on-surface">
                Special needs or dispatch requirements
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-start gap-3 p-3.5 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container-low transition-colors cursor-pointer">
                  <input
                    checked={specialNeeds.elderlyChildren}
                    className="mt-0.5 w-5 h-5 rounded text-primary focus:ring-primary border-outline"
                    onChange={(e) =>
                      setSpecialNeeds((prev) => ({ ...prev, elderlyChildren: e.target.checked }))
                    }
                    type="checkbox"
                  />
                  <div>
                    <span className="text-xs font-bold text-on-surface block">
                      Elderly / Children present
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      Infants, toddlers, or seniors needing physical transfer assistance.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3.5 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container-low transition-colors cursor-pointer">
                  <input
                    checked={specialNeeds.mobilityImpaired}
                    className="mt-0.5 w-5 h-5 rounded text-primary focus:ring-primary border-outline"
                    onChange={(e) =>
                      setSpecialNeeds((prev) => ({ ...prev, mobilityImpaired: e.target.checked }))
                    }
                    type="checkbox"
                  />
                  <div>
                    <span className="text-xs font-bold text-on-surface block">
                      Mobility impaired
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      Wheelchair dependent, bedridden, or non-ambulatory.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3.5 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container-low transition-colors cursor-pointer">
                  <input
                    checked={specialNeeds.medicalOxygen}
                    className="mt-0.5 w-5 h-5 rounded text-primary focus:ring-primary border-outline"
                    onChange={(e) =>
                      setSpecialNeeds((prev) => ({ ...prev, medicalOxygen: e.target.checked }))
                    }
                    type="checkbox"
                  />
                  <div>
                    <span className="text-xs font-bold text-on-surface block">
                      Medical emergency / Oxygen required
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      Critical prescription loss, dialysis, or powered oxygen reliance.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3.5 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container-low transition-colors cursor-pointer">
                  <input
                    checked={specialNeeds.pets}
                    className="mt-0.5 w-5 h-5 rounded text-primary focus:ring-primary border-outline"
                    onChange={(e) =>
                      setSpecialNeeds((prev) => ({ ...prev, pets: e.target.checked }))
                    }
                    type="checkbox"
                  />
                  <div>
                    <span className="text-xs font-bold text-on-surface block">
                      Pets requiring evacuation
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      Domestic animals needing crates or vessel safety gear.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </fieldset>

          {/* Section 3: Urgency Level */}
          <fieldset className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 md:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-surface-variant">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary">emergency</span>
                <h2 className="font-manrope text-lg text-on-surface font-semibold">
                  3. Urgency Level
                </h2>
              </div>
              <span className="font-mono text-xs uppercase font-bold bg-error-container text-on-error-container px-2 py-0.5 rounded">
                Select One
              </span>
            </div>

            <div className="space-y-3">
              {/* Critical */}
              <label
                className={`relative flex items-start gap-3.5 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  urgency === 'CRITICAL'
                    ? 'border-tertiary bg-red-50/60'
                    : 'border-outline-variant bg-surface hover:bg-red-50/30'
                }`}
              >
                <input
                  checked={urgency === 'CRITICAL'}
                  className="mt-1 w-5 h-5 text-tertiary focus:ring-tertiary border-outline"
                  name="urgency_level"
                  onChange={() => setUrgency('CRITICAL')}
                  type="radio"
                  value="CRITICAL"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-full bg-tertiary inline-block" />
                    <span className="text-sm font-bold text-tertiary uppercase tracking-wide">
                      Critical Urgency
                    </span>
                    <span className="font-mono text-[10px] font-bold bg-red-100 text-red-900 px-1.5 py-0.5 rounded ml-auto">
                      Tier 1
                    </span>
                  </div>
                  <p className="text-sm text-on-surface font-medium">
                    Immediate danger — rising water entering living quarters or severe physical
                    injury.
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Prioritizes nearest active swift-water boat or air rescue craft.
                  </p>
                </div>
              </label>

              {/* High / Urgent */}
              <label
                className={`relative flex items-start gap-3.5 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  urgency === 'HIGH'
                    ? 'border-amber-600 bg-amber-50/60'
                    : 'border-outline-variant bg-surface hover:bg-amber-50/30'
                }`}
              >
                <input
                  checked={urgency === 'HIGH'}
                  className="mt-1 w-5 h-5 text-amber-600 focus:ring-amber-500 border-outline"
                  name="urgency_level"
                  onChange={() => setUrgency('HIGH')}
                  type="radio"
                  value="HIGH"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-full bg-amber-600 inline-block" />
                    <span className="text-sm font-bold text-amber-900 uppercase tracking-wide">
                      High / Urgent
                    </span>
                    <span className="font-mono text-[10px] font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded ml-auto">
                      Tier 2
                    </span>
                  </div>
                  <p className="text-sm text-on-surface font-medium">
                    Surrounded by floodwaters — safe for now on upper level, but waters continuing
                    to rise.
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Queued into secondary rescue zone evacuation sweeps over the upcoming shifts.
                  </p>
                </div>
              </label>

              {/* Medium */}
              <label
                className={`relative flex items-start gap-3.5 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  urgency === 'MEDIUM'
                    ? 'border-blue-600 bg-blue-50/60'
                    : 'border-outline-variant bg-surface hover:bg-blue-50/30'
                }`}
              >
                <input
                  checked={urgency === 'MEDIUM'}
                  className="mt-1 w-5 h-5 text-blue-600 focus:ring-blue-500 border-outline"
                  name="urgency_level"
                  onChange={() => setUrgency('MEDIUM')}
                  type="radio"
                  value="MEDIUM"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" />
                    <span className="text-sm font-bold text-blue-900 uppercase tracking-wide">
                      Moderate Risk
                    </span>
                    <span className="font-mono text-[10px] font-bold bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded ml-auto">
                      Tier 3
                    </span>
                  </div>
                  <p className="text-sm text-on-surface font-medium">
                    Power outage, road access blocked, but structure currently dry and stable.
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Included in planned neighborhood transit runs.
                  </p>
                </div>
              </label>

              {/* Low */}
              <label
                className={`relative flex items-start gap-3.5 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  urgency === 'LOW'
                    ? 'border-slate-500 bg-slate-100'
                    : 'border-outline-variant bg-surface hover:bg-slate-100/50'
                }`}
              >
                <input
                  checked={urgency === 'LOW'}
                  className="mt-1 w-5 h-5 text-slate-700 focus:ring-slate-500 border-outline"
                  name="urgency_level"
                  onChange={() => setUrgency('LOW')}
                  type="radio"
                  value="LOW"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-full bg-slate-500 inline-block" />
                    <span className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                      Low Priority
                    </span>
                    <span className="font-mono text-[10px] font-bold bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded ml-auto">
                      Tier 4
                    </span>
                  </div>
                  <p className="text-sm text-on-surface font-medium">
                    Precautionary evacuation request or general supplies inquiry.
                  </p>
                </div>
              </label>
            </div>
          </fieldset>

          {/* Section 4: Additional Notes */}
          <fieldset className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 md:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-surface-variant">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">notes</span>
                <h2 className="font-manrope text-lg text-on-surface font-semibold">
                  4. Field Notes &amp; Contact
                </h2>
              </div>
              <span className="font-mono text-xs uppercase font-bold bg-surface-container px-2 py-0.5 rounded text-on-surface-variant">
                Optional
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-on-surface" htmlFor="notesInput">
                Additional Instructions for Rescue Crews
              </label>
              <textarea
                className="w-full h-24 p-3 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary"
                id="notesInput"
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., White bedsheet tied to chimney; please approach from south side to avoid submerged fence."
                value={notes}
              />
            </div>
          </fieldset>

          {/* Submission Feedback Modal/Alert for Milestone 1 */}
          {submittedDevMode && (
            <div className="p-5 rounded-xl bg-emerald-50 border-2 border-emerald-500 text-emerald-950 space-y-3">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-base">
                <span className="material-symbols-outlined text-emerald-600">check_circle</span>
                <span>Client-Side Validation Passed (Milestone 1 Preview)</span>
              </div>
              <p className="text-xs text-emerald-900 leading-relaxed">
                Form inputs are valid. In accordance with Milestone 1 rules, no fake server request
                ID was generated and no live dispatch mutation occurred. Real database persistence
                connects in <strong>Milestone 2</strong>.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <Link
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-container text-on-primary text-xs font-bold hover:bg-primary transition-colors"
                  href="/citizen/confirmation"
                >
                  <span>View Simulated Confirmation Layout</span>
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </Link>
                <button
                  className="px-3 py-2 text-xs font-semibold text-emerald-800 hover:underline"
                  onClick={() => setSubmittedDevMode(false)}
                  type="button"
                >
                  Dismiss Preview
                </button>
              </div>
            </div>
          )}

          {/* Submit Trigger */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-on-surface-variant flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[18px]">lock</span>
              <span>All details transmitted via encrypted civil defense protocol</span>
            </div>

            <button
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-primary-container text-on-primary font-manrope text-base font-bold shadow-md hover:bg-primary transition-all active:scale-[0.99] flex items-center justify-center gap-2"
              type="submit"
            >
              <span className="material-symbols-outlined text-[20px]">send</span>
              <span>Transmit Emergency Dispatch Request</span>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
