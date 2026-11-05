'use client';

import React, { useState } from 'react';
import type { HazardLevel } from '@floodrelay/shared';
import { apiClient } from '@/lib/api/client';
import { useOperatorAuth } from '@/lib/auth/OperatorAuthContext';
import { hasPermission } from '@/lib/auth/permissions';

export interface RoadBlockageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onZoneCreated?: () => void;
}

export function RoadBlockageModal({ isOpen, onClose, onZoneCreated }: RoadBlockageModalProps) {
  const { operator } = useOperatorAuth();
  const canManageBlockedZones = hasPermission(operator, 'MANAGE_BLOCKED_ZONES');

  const [name, setName] = useState<string>('');
  const [severity, setSeverity] = useState<HazardLevel>('BLOCKED');
  const [centerLat, setCenterLat] = useState<string>('29.7604');
  const [centerLng, setCenterLng] = useState<string>('-95.3698');
  const [radiusKm, setRadiusKm] = useState<string>('0.5');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageBlockedZones) return;

    const lat = parseFloat(centerLat);
    const lng = parseFloat(centerLng);
    const rad = parseFloat(radiusKm);

    if (isNaN(lat) || isNaN(lng) || isNaN(rad) || rad <= 0) {
      setError('Please provide valid center coordinates and positive radius in km.');
      return;
    }

    // Generate a simple bounding polygon from center + radius (approx metric degree offset)
    const dLat = rad / 111.0;
    const dLng = rad / (111.0 * Math.cos((lat * Math.PI) / 180));
    const polygon = [
      { lat: Number((lat + dLat).toFixed(6)), lng: Number((lng - dLng).toFixed(6)) },
      { lat: Number((lat + dLat).toFixed(6)), lng: Number((lng + dLng).toFixed(6)) },
      { lat: Number((lat - dLat).toFixed(6)), lng: Number((lng + dLng).toFixed(6)) },
      { lat: Number((lat - dLat).toFixed(6)), lng: Number((lng - dLng).toFixed(6)) },
      { lat: Number((lat + dLat).toFixed(6)), lng: Number((lng - dLng).toFixed(6)) },
    ];

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await apiClient.createRoadZone({
        name: name.trim() || `Hazard Zone near ${lat.toFixed(3)}, ${lng.toFixed(3)}`,
        severity,
        polygon,
        reason: reason.trim() || undefined,
      });

      setSuccess(`Blocked road zone "${result.zone?.name || 'Hazard'}" created successfully.`);
      onZoneCreated?.();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError((err as Error).message || 'Failed to record road blockage zone');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      aria-labelledby="blockage-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in"
      role="dialog"
    >
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-rose-600">block</span>
            <h3 className="font-bold text-base text-on-surface" id="blockage-modal-title">
              Register Road Network Hazard / Blockage
            </h3>
          </div>
          <button
            className="p-1 rounded text-on-surface-variant hover:text-on-surface"
            onClick={onClose}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <p className="text-xs text-on-surface-variant">
          Mark a flood-impeded or fully submerged road segment. Road vehicles under OSRM will
          reroute around this hazard zone, triggering local replans for affected assignments.
        </p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-on-surface" htmlFor="zoneName">
              Zone Identifier / Location Name
            </label>
            <input
              className="w-full h-10 px-3 rounded-lg bg-surface border border-outline-variant text-xs text-on-surface focus:ring-2 focus:ring-primary placeholder:text-outline"
              id="zoneName"
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Buffalo Bayou Parkway Underpass Inundated"
              required
              type="text"
              value={name}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface" htmlFor="hazardSeverity">
                Hazard Severity
              </label>
              <select
                className="w-full h-10 px-3 rounded-lg bg-surface border border-outline-variant text-xs font-semibold text-on-surface focus:ring-2 focus:ring-primary"
                id="hazardSeverity"
                onChange={(e) => setSeverity(e.target.value as HazardLevel)}
                value={severity}
              >
                <option value="BLOCKED">BLOCKED (Complete road closure)</option>
                <option value="WATER_SURGE">WATER SURGE (Swift water hazard)</option>
                <option value="CAUTION">CAUTION (Impeded transit)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface" htmlFor="hazardRadius">
                Buffer Radius (km)
              </label>
              <input
                className="w-full h-10 px-3 rounded-lg bg-surface border border-outline-variant text-xs font-mono text-on-surface focus:ring-2 focus:ring-primary"
                id="hazardRadius"
                onChange={(e) => setRadiusKm(e.target.value)}
                step="0.1"
                type="number"
                value={radiusKm}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 font-mono">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface" htmlFor="hazardLat">
                Latitude
              </label>
              <input
                className="w-full h-10 px-3 rounded-lg bg-surface border border-outline-variant text-xs text-on-surface focus:ring-2 focus:ring-primary"
                id="hazardLat"
                onChange={(e) => setCenterLat(e.target.value)}
                placeholder="29.7604"
                step="0.0001"
                type="number"
                value={centerLat}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface" htmlFor="hazardLng">
                Longitude
              </label>
              <input
                className="w-full h-10 px-3 rounded-lg bg-surface border border-outline-variant text-xs text-on-surface focus:ring-2 focus:ring-primary"
                id="hazardLng"
                onChange={(e) => setCenterLng(e.target.value)}
                placeholder="-95.3698"
                step="0.0001"
                type="number"
                value={centerLng}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-on-surface" htmlFor="hazardReason">
              Incident Reason / Field Telemetry
            </label>
            <input
              className="w-full h-10 px-3 rounded-lg bg-surface border border-outline-variant text-xs text-on-surface focus:ring-2 focus:ring-primary placeholder:text-outline"
              id="hazardReason"
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Police barricade placed due to 4ft water crest"
              type="text"
              value={reason}
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-800 dark:text-rose-300">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-800 dark:text-emerald-300">
              {success}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
            <button
              className="px-4 py-2 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-variant transition-colors"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              disabled={isSubmitting || !canManageBlockedZones}
              type="submit"
            >
              {isSubmitting ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-sm">
                    progress_activity
                  </span>
                  <span>Registering...</span>
                </>
              ) : (
                <span>Register Road Closure</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
