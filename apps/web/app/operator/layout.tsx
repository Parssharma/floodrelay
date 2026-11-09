'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { OperatorAuthProvider, useOperatorAuth } from '@/lib/auth/OperatorAuthContext';
import { OperatorTopNav } from '@/components/operator/OperatorTopNav';

function OperatorLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useOperatorAuth();

  // Redirect to login only after authentication check completes, the operator is unauthenticated,
  // and the current route is not the login page itself.
  useEffect(() => {
    if (!isLoading && !isAuthenticated && pathname !== '/operator/login') {
      router.replace(`/operator/login?from=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  // The login route renders standalone without top nav
  if (pathname === '/operator/login') {
    return <>{children}</>;
  }

  // Session verification loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A2540] flex flex-col items-center justify-center p-4 text-white font-inter">
        <div className="w-10 h-10 border-4 border-[#0066CC]/30 border-t-[#0066CC] rounded-full animate-spin mb-4" />
        <div className="text-sm font-bold font-mono tracking-wider text-slate-200">
          VERIFYING COMMAND SESSION...
        </div>
        <div className="text-xs text-slate-400 mt-1 font-mono">
          Checking cryptographic authorization
        </div>
      </div>
    );
  }

  // Unauthenticated guard: Render placeholder while useEffect triggers redirect to prevent React
  // "Cannot update a component (Router) while rendering a different component" runtime errors.
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0A2540] flex flex-col items-center justify-center p-4 text-white font-inter">
        <div className="text-sm font-bold font-mono text-amber-400 tracking-wider">
          AUTHENTICATION REQUIRED
        </div>
        <div className="text-xs text-slate-400 mt-1 font-mono">
          Redirecting to secure operator login...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#334155] font-inter antialiased flex flex-col w-full overflow-x-hidden">
      <OperatorTopNav />
      {/* Full-width Workspace Canvas without sidebar offset */}
      <main className="flex-1 flex flex-col min-h-[calc(100vh-3.5rem)] w-full">{children}</main>
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
