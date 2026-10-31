'use client';

import React, { useState } from 'react';
import { OperatorSidebar } from '@/components/operator/OperatorSidebar';
import { OperatorHeader } from '@/components/operator/OperatorHeader';
import { OperatorMobileNav } from '@/components/operator/OperatorMobileNav';

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface text-on-surface font-inter antialiased flex flex-col">
      <OperatorSidebar />
      <OperatorMobileNav isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <OperatorHeader onToggleMobileNav={() => setMobileNavOpen((prev) => !prev)} />

      {/* Main Workspace Canvas with sidebar offset */}
      <div className="flex-1 ml-0 lg:ml-64 pt-14 flex flex-col min-h-screen">{children}</div>
    </div>
  );
}
