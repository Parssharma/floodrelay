'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SimulatedNotice } from '@/components/ui/SimulatedNotice';

interface OperatorHeaderProps {
  onToggleMobileNav?: () => void;
}

export function OperatorHeader({ onToggleMobileNav }: OperatorHeaderProps) {
  const pathname = usePathname();

  let pageTitle = 'Command Overview';
  let subRoute = '/operator';

  if (pathname.startsWith('/operator/requests')) {
    pageTitle = 'Rescue Request Management';
    subRoute = '/operator/requests';
  } else if (pathname.startsWith('/operator/map')) {
    pageTitle = 'Operations GIS Tactical Map';
    subRoute = '/operator/map';
  } else if (pathname.startsWith('/operator/assignments/')) {
    pageTitle = 'Assignment Inspection & Human Commit';
    subRoute = pathname;
  } else if (pathname.startsWith('/operator/assignments')) {
    pageTitle = 'Resource Assignment & Dispatch Planning';
    subRoute = '/operator/assignments';
  }

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-14 z-30 bg-surface-container-lowest border-b border-outline-variant shadow-xs flex items-center justify-between px-4 lg:px-6">
      {/* Leading Section: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden p-1.5 rounded-lg text-on-surface hover:bg-surface-container"
          onClick={onToggleMobileNav}
          type="button"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>

        <div className="flex items-center gap-2 overflow-hidden">
          <Link
            className="text-sm font-bold text-on-surface hover:text-primary transition-colors truncate"
            href="/operator"
          >
            FloodRelay Command
          </Link>
          <span className="text-outline text-xs">/</span>
          <span className="text-xs font-semibold text-primary truncate max-w-[180px] sm:max-w-none">
            {pageTitle}
          </span>
          <span className="hidden xl:inline-block font-mono text-[10px] text-on-surface-variant bg-surface-container px-2 py-0.5 rounded border border-outline-variant/40">
            {subRoute}
          </span>
        </div>
      </div>

      {/* Trailing Section: Simulated Notice, Alerts & Actions */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2">
          <SimulatedNotice label="SIMULATED DATA" />
        </div>

        {/* Active Alerts Pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-300 rounded text-xs font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
          <span>3 Alerts</span>
        </div>

        {/* Action Buttons */}
        <div className="hidden md:flex items-center gap-2">
          <button
            className="h-8 px-2.5 rounded border border-outline-variant bg-surface-container-lowest text-on-surface text-xs font-semibold hover:bg-surface-container transition-colors flex items-center gap-1"
            onClick={() => alert('Incident log export preview (Milestone 1 prototype)')}
            type="button"
          >
            <span className="material-symbols-outlined text-sm">file_download</span>
            <span>Export Log</span>
          </button>
          <button
            className="h-8 px-3 rounded bg-tertiary text-on-tertiary text-xs font-bold hover:bg-tertiary-container transition-colors flex items-center gap-1 shadow-xs"
            onClick={() => alert('Emergency broadcast control preview (Milestone 1 prototype)')}
            type="button"
          >
            <span className="material-symbols-outlined text-sm">cell_tower</span>
            <span>Broadcast</span>
          </button>
        </div>
      </div>
    </header>
  );
}
