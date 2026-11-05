'use client';

import React from 'react';
import type {
  ListOperationalEventsFilter,
  OperationalEventType,
  EventEntityType,
  EventProcessingStatus,
} from '@/lib/api/types';

export interface EventFiltersProps {
  filters: ListOperationalEventsFilter;
  onChange: (updated: ListOperationalEventsFilter) => void;
  onReset: () => void;
  className?: string;
}

const EVENT_TYPE_OPTIONS: { label: string; value: OperationalEventType }[] = [
  { label: 'Request Created', value: 'REQUEST_CREATED' },
  { label: 'Request Flagged Duplicate', value: 'REQUEST_FLAGGED_DUPLICATE' },
  { label: 'Request Cancelled', value: 'REQUEST_CANCELLED' },
  { label: 'Resource Offline', value: 'RESOURCE_OFFLINE' },
  { label: 'Resource Available', value: 'RESOURCE_AVAILABLE' },
  { label: 'Road Blocked', value: 'ROAD_BLOCKED' },
  { label: 'Road Reopened', value: 'ROAD_REOPENED' },
];

const ENTITY_TYPE_OPTIONS: { label: string; value: EventEntityType }[] = [
  { label: 'Request', value: 'REQUEST' },
  { label: 'Resource', value: 'RESOURCE' },
  { label: 'Road Zone', value: 'ROAD_ZONE' },
  { label: 'Assignment', value: 'ASSIGNMENT' },
];

const STATUS_OPTIONS: { label: string; value: EventProcessingStatus }[] = [
  { label: 'Recorded', value: 'RECORDED' },
  { label: 'Scope Identified', value: 'SCOPE_IDENTIFIED' },
  { label: 'Awaiting Repair', value: 'AWAITING_REPAIR' },
  { label: 'Failed', value: 'FAILED' },
];

export function EventFilters({ filters, onChange, onReset, className = '' }: EventFiltersProps) {
  const hasActiveFilters = Boolean(
    filters.type || filters.entityType || filters.status || filters.entityId,
  );

  return (
    <div
      className={`p-3 bg-surface-container-lowest border border-outline-variant rounded-xl flex flex-wrap items-center gap-3 text-xs ${className}`}
      data-testid="event-filters"
    >
      {/* Event Type Filter */}
      <div className="flex flex-col gap-1 min-w-[140px]">
        <label
          className="text-[11px] font-semibold text-on-surface-variant"
          htmlFor="filterEventType"
        >
          Event Type
        </label>
        <select
          className="h-9 px-2.5 rounded-lg bg-surface border border-outline-variant text-on-surface font-medium focus:ring-1 focus:ring-primary"
          id="filterEventType"
          onChange={(e) =>
            onChange({
              ...filters,
              type: (e.target.value as OperationalEventType) || undefined,
              offset: 0,
            })
          }
          value={filters.type || ''}
        >
          <option value="">All Event Types</option>
          {EVENT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Entity Type Filter */}
      <div className="flex flex-col gap-1 min-w-[120px]">
        <label
          className="text-[11px] font-semibold text-on-surface-variant"
          htmlFor="filterEntityType"
        >
          Entity Type
        </label>
        <select
          className="h-9 px-2.5 rounded-lg bg-surface border border-outline-variant text-on-surface font-medium focus:ring-1 focus:ring-primary"
          id="filterEntityType"
          onChange={(e) =>
            onChange({
              ...filters,
              entityType: (e.target.value as EventEntityType) || undefined,
              offset: 0,
            })
          }
          value={filters.entityType || ''}
        >
          <option value="">All Entities</option>
          {ENTITY_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Processing Status Filter */}
      <div className="flex flex-col gap-1 min-w-[130px]">
        <label className="text-[11px] font-semibold text-on-surface-variant" htmlFor="filterStatus">
          Status
        </label>
        <select
          className="h-9 px-2.5 rounded-lg bg-surface border border-outline-variant text-on-surface font-medium focus:ring-1 focus:ring-primary"
          id="filterStatus"
          onChange={(e) =>
            onChange({
              ...filters,
              status: (e.target.value as EventProcessingStatus) || undefined,
              offset: 0,
            })
          }
          value={filters.status || ''}
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Entity ID Search */}
      <div className="flex flex-col gap-1 min-w-[140px] flex-1">
        <label
          className="text-[11px] font-semibold text-on-surface-variant"
          htmlFor="filterEntityId"
        >
          Target Entity ID
        </label>
        <input
          className="h-9 px-2.5 rounded-lg bg-surface border border-outline-variant text-on-surface font-mono placeholder:text-outline text-xs focus:ring-1 focus:ring-primary"
          id="filterEntityId"
          onChange={(e) =>
            onChange({
              ...filters,
              entityId: e.target.value.trim() || undefined,
              offset: 0,
            })
          }
          placeholder="e.g. req-123 or res-alpha"
          type="text"
          value={filters.entityId || ''}
        />
      </div>

      {/* Reset Action */}
      {hasActiveFilters && (
        <div className="flex items-end pt-5">
          <button
            className="h-9 px-3 rounded-lg border border-outline-variant text-primary hover:bg-surface-variant font-semibold text-xs transition-colors flex items-center gap-1"
            onClick={onReset}
            type="button"
          >
            <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>
            <span>Reset</span>
          </button>
        </div>
      )}
    </div>
  );
}
