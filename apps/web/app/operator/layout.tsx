'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { OperatorAuthProvider, useOperatorAuth } from '@/lib/auth/OperatorAuthContext';
import { OperatorSidebar } from '@/components/operator/OperatorSidebar';
import { OperatorHeader } from '@/components/operator/OperatorHeader';
import { OperatorMobileNav } from '@/components/operator/OperatorMobileNav';

function OperatorLayoutContent({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useOperatorAuth();

  // The login route renders standalone without sidebar/header
  if (pathname === '/operator/login') {
    return <>{children}</>;
  }

  // Session verification loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d1c2f] flex flex-col items-center justify-center p-4 text-white font-inter">
        <div className="w-10 h-10 border-4 border-primary-fixed/30 border-t-primary-fixed rounded-full animate-spin mb-4" />
        <div className="text-sm font-bold font-mono tracking-wider text-primary-fixed">
          VERIFYING COMMAND SESSION...
        </div>
        <div className="text-xs text-white/50 mt-1 font-mono">
          Checking cryptographic authorization
        </div>
      </div>
    );
  }

  // Unauthenticated guard
  if (!isAuthenticated) {
    if (typeof window !== 'undefined') {
      router.replace(`/operator/login?from=${encodeURIComponent(pathname)}`);
    }
    return (
      <div className="min-h-screen bg-[#0d1c2f] flex flex-col items-center justify-center p-4 text-white font-inter">
        <div className="text-sm font-bold font-mono text-tertiary-fixed tracking-wider">
          AUTHENTICATION REQUIRED
        </div>
        <div className="text-xs text-white/60 mt-1 font-mono">
          Redirecting to secure operator login...
        </div>
      </div>
    );
  }

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

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <OperatorAuthProvider>
      <OperatorLayoutContent>{children}</OperatorLayoutContent>
    </OperatorAuthProvider>
  );
}
