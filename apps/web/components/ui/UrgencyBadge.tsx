import React from 'react';
import type { UrgencyLevel } from '@floodrelay/shared';

interface UrgencyBadgeProps {
  urgency: UrgencyLevel | string;
  className?: string;
}

export function UrgencyBadge({ urgency, className = '' }: UrgencyBadgeProps) {
  const norm = urgency.toUpperCase();

  let badgeStyle = 'bg-surface-container text-on-surface-variant border-outline-variant';
  let dotColor = 'bg-outline';

  if (norm === 'CRITICAL') {
    badgeStyle = 'bg-red-100 text-red-900 border-red-300 font-bold';
    dotColor = 'bg-tertiary animate-pulse';
  } else if (norm === 'HIGH' || norm === 'URGENT') {
    badgeStyle = 'bg-amber-100 text-amber-900 border-amber-300 font-semibold';
    dotColor = 'bg-amber-600';
  } else if (norm === 'MEDIUM') {
    badgeStyle = 'bg-blue-50 text-blue-900 border-blue-200';
    dotColor = 'bg-blue-500';
  } else if (norm === 'LOW') {
    badgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';
    dotColor = 'bg-slate-400';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs border tracking-tight ${badgeStyle} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span>{norm}</span>
    </span>
  );
}

export default UrgencyBadge;
