'use client';

import React, { useState } from 'react';
import type { RescueResource, ResourceStatus } from '@floodrelay/shared';
import { apiClient } from '@/lib/api/client';
import { useOperatorAuth } from '@/lib/auth/OperatorAuthContext';
import { hasPermission } from '@/lib/auth/permissions';

export interface ResourceStatusPanelProps {
  resources: RescueResource[];
  onResourceUpdated?: () => void;
  className?: string;
}

export function ResourceStatusPanel({
  resources,
  onResourceUpdated,
  className = '',
}: ResourceStatusPanelProps) {
  const { operator } = useOperatorAuth();
  const canManageStatus = hasPermission(operator, 'MANAGE_RESOURCE_STATUS');

  const [selectedResource, setSelectedResource] = useState<RescueResource | null>(null);
  const [targetStatus, setTargetStatus] = useState<ResourceStatus>('AVAILABLE');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationSuccess, setMutationSuccess] = useState<string | null>(null);

  const handleOpenDialog = (res: RescueResource) => {
    setSelectedResource(res);
    setTargetStatus(res.status);
    setReason('');
    setMutationError(null);
    setMutationSuccess(null);
  };

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResource || !canManageStatus) return;

    setIsSubmitting(true);
    setMutationError(null);
    setMutationSuccess(null);

    try {
      const result = await apiClient.updateResourceStatus(selectedResource.id, {
        status: targetStatus,
        reason: reason.trim() || undefined,
      });

      setMutationSuccess(
        `Resource "${result.resource.name || selectedResource.id}" status updated to ${result.resource.status}.`,
      );
      onResourceUpdated?.();
      setTimeout(() => {
        setSelectedResource(null);
      }, 1500);
    } catch (err) {
      setMutationError((err as Error).message || 'Failed to update resource status');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: ResourceStatus) => {
    switch (status) {
      case 'AVAILABLE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            AVAILABLE
          </span>
        );
      case 'ASSIGNED':
      case 'EN_ROUTE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            {status}
          </span>
        );
      case 'MAINTENANCE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            MAINTENANCE
          </span>
        );
      case 'OFFLINE':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            OFFLINE
          </span>
        );
    }
  };

  return (
    <div
      className={`bg-surface-container-lowest border border-outline-variant rounded-xl p-5 space-y-4 ${className}`}
      data-testid="resource-status-panel"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">directions_boat</span>
          <h3 className="font-manrope text-base font-bold text-on-surface">
            Rescue Fleet & Resource Roster
          </h3>
        </div>
        {!canManageStatus && (
          <span className="text-[11px] font-mono text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">
            Role ({operator?.role || 'OPERATOR'}): View Only
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/30 text-on-surface-variant font-mono text-[11px]">
              <th className="pb-2.5 font-semibold">Asset ID & Name</th>
              <th className="pb-2.5 font-semibold">Type</th>
              <th className="pb-2.5 font-semibold">Capacity</th>
              <th className="pb-2.5 font-semibold">Speed</th>
              <th className="pb-2.5 font-semibold">Status</th>
              <th className="pb-2.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/15 font-mono text-xs">
            {resources.map((res) => (
              <tr className="hover:bg-surface-container/50 transition-colors" key={res.id}>
                <td className="py-2.5 font-bold text-on-surface">
                  <span className="block font-sans text-xs">{res.name || res.id}</span>
                  <span className="text-[10px] text-on-surface-variant font-mono">{res.id}</span>
                </td>
                <td className="py-2.5 text-on-surface-variant">{res.type}</td>
                <td className="py-2.5 text-on-surface">{res.capacity} pax</td>
                <td className="py-2.5 text-on-surface">{res.speedKmH} km/h</td>
                <td className="py-2.5">{getStatusBadge(res.status)}</td>
                <td className="py-2.5 text-right font-sans">
                  {canManageStatus ? (
                    <button
                      className="px-2.5 py-1 rounded border border-outline-variant hover:bg-surface-variant font-semibold text-[11px] text-primary transition-colors"
                      onClick={() => handleOpenDialog(res)}
                      type="button"
                    >
                      Update
                    </button>
                  ) : (
                    <span className="text-[10px] text-on-surface-variant/60 italic">Read-only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Resource Status Mutation Modal */}
      {selectedResource && (
        <div
          aria-labelledby="status-dialog-title"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in"
          role="dialog"
        >
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <h4 className="font-bold text-base text-on-surface" id="status-dialog-title">
                Modify Resource Status
              </h4>
              <button
                className="p-1 rounded text-on-surface-variant hover:text-on-surface"
                onClick={() => setSelectedResource(null)}
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="text-xs text-on-surface-variant">
              Update availability state for{' '}
              <strong className="text-on-surface">
                {selectedResource.name} ({selectedResource.id})
              </strong>
              . Consequential changes automatically trigger an operational event and scope
              evaluation.
            </p>

            <form className="space-y-4" onSubmit={handleStatusUpdate}>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface" htmlFor="statusSelect">
                  New Operational Status
                </label>
                <select
                  className="w-full h-10 px-3 rounded-lg bg-surface border border-outline-variant text-sm font-semibold text-on-surface focus:ring-2 focus:ring-primary"
                  id="statusSelect"
                  onChange={(e) => setTargetStatus(e.target.value as ResourceStatus)}
                  value={targetStatus}
                >
                  <option value="AVAILABLE">AVAILABLE (Ready for immediate dispatch)</option>
                  <option value="MAINTENANCE">MAINTENANCE (Fueling / mechanical repairs)</option>
                  <option value="OFFLINE">OFFLINE (Withdrawn from sector service)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface" htmlFor="reasonInput">
                  Operational Reason (Logged in Audit Trail)
                </label>
                <input
                  className="w-full h-10 px-3 rounded-lg bg-surface border border-outline-variant text-xs text-on-surface focus:ring-2 focus:ring-primary placeholder:text-outline"
                  id="reasonInput"
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Engine impeller obstruction cleared"
                  type="text"
                  value={reason}
                />
              </div>

              {mutationError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-800 dark:text-rose-300">
                  {mutationError}
                </div>
              )}

              {mutationSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-800 dark:text-emerald-300">
                  {mutationSuccess}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
                <button
                  className="px-4 py-2 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-variant transition-colors"
                  onClick={() => setSelectedResource(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  disabled={isSubmitting || targetStatus === selectedResource.status}
                  type="submit"
                >
                  {isSubmitting ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-sm">
                        progress_activity
                      </span>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Confirm Status Change</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
