import React from 'react';

export type BadgeStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'IN_TRANSIT'
  | 'RESCUED'
  | 'CANCELLED'
  | 'PROPOSED'
  | 'COMMITTED'
  | 'AVAILABLE'
  | 'VERIFIED'
  | 'UNVERIFIED';

interface StatusBadgeProps {
  status: BadgeStatus | string;
  className?: string;
  showDot?: boolean;
}

export function StatusBadge({ status, className = '', showDot = true }: StatusBadgeProps) {
  const norm = status.toUpperCase();

  let colorClasses = 'bg-surface-container text-on-surface-variant border-outline-variant';
  let dotColor = 'bg-outline';

  if (norm === 'PENDING' || norm === 'UNVERIFIED') {
    colorClasses = 'bg-amber-50 text-amber-900 border-amber-300';
    dotColor = 'bg-amber-600';
  } else if (norm === 'ASSIGNED' || norm === 'PROPOSED') {
    colorClasses = 'bg-primary-fixed/30 text-primary border-primary/30';
    dotColor = 'bg-primary';
  } else if (
    norm === 'COMMITTED' ||
    norm === 'VERIFIED' ||
    norm === 'RESCUED' ||
    norm === 'AVAILABLE'
  ) {
    colorClasses = 'bg-emerald-50 text-emerald-900 border-emerald-300';
    dotColor = 'bg-emerald-600';
  } else if (norm === 'IN_TRANSIT') {
    colorClasses = 'bg-blue-50 text-blue-900 border-blue-300';
    dotColor = 'bg-blue-600 animate-pulse';
  } else if (norm === 'CANCELLED') {
    colorClasses = 'bg-red-50 text-red-900 border-red-300';
    dotColor = 'bg-red-600';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClasses} ${className}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
      <span>{status}</span>
    </span>
  );
}

export default StatusBadge;
