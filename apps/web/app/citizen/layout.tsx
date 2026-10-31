import React from 'react';
import { CitizenHeader } from '@/components/citizen/CitizenHeader';
import { CitizenFooter } from '@/components/citizen/CitizenFooter';
import { EmergencyBanner } from '@/components/citizen/EmergencyBanner';

export default function CitizenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-on-surface font-public-sans antialiased">
      <EmergencyBanner />
      <CitizenHeader />
      <div className="flex-1 flex flex-col">{children}</div>
      <CitizenFooter />
    </div>
  );
}
