import React from 'react';

interface SimulatedNoticeProps {
  label?: string;
  message?: string;
  variant?: 'pill' | 'banner';
  className?: string;
}

export function SimulatedNotice({
  label,
  message,
  variant = 'pill',
  className = '',
}: SimulatedNoticeProps) {
  const text = message || label || 'SIMULATED DATA — DEVELOPMENT MODE';

  if (variant === 'banner') {
    return (
      <div
        className={`bg-amber-500/10 border-b border-amber-500/30 text-amber-900 px-4 py-1.5 text-center text-xs font-semibold flex items-center justify-center gap-2 ${className}`}
      >
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <span>{text}</span>
        <span className="text-amber-700 font-normal">
          | Live backend integration scheduled for Milestone 2+
        </span>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase tracking-wider bg-slate-800 text-slate-100 border border-slate-700 ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      <span>{text}</span>
    </span>
  );
}

export default SimulatedNotice;
