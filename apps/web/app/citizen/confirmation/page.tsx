'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { SimulatedNotice } from '@/components/ui/SimulatedNotice';

export default function CitizenConfirmationPage() {
  const [copied, setCopied] = useState<boolean>(false);
  const ticketId = '#FL-8824-TX';

  const copyTicketId = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(ticketId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 md:px-8 py-8 md:py-12 pb-20">
      {/* System Status Micro-Banner with Explicit Simulated Notice */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-4 py-2.5 mb-6 bg-surface-container-low border border-outline-variant rounded-lg text-xs text-on-surface-variant">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          <span>Regional EOC Sector 4 (Harris County Flood Basin) Active Logging</span>
        </div>
        <SimulatedNotice label="SIMULATED CONFIRMATION FIXTURE" />
      </div>

      {/* Confirmation Header Banner */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 md:p-8 mb-8 text-center relative overflow-hidden">
        <div className="max-w-2xl mx-auto flex flex-col items-center">
          {/* Reassuring Emerald Checkmark Ring */}
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary-fixed/40 border-2 border-primary-container flex items-center justify-center mb-5 text-primary">
            <span
              className="material-symbols-outlined text-4xl md:text-5xl"
              data-icon="check_circle"
            >
              check_circle
            </span>
          </div>

          <h1 className="font-manrope text-2xl md:text-4xl text-on-surface font-extrabold tracking-tight mb-3">
            Your Request Has Been Submitted
          </h1>

          {/* Transparent Operational Status Disclosure */}
          <div className="bg-surface-container-low border-l-4 border-primary-container px-4 py-3 rounded text-left w-full mt-2">
            <p className="text-sm font-semibold text-on-surface">
              <span className="text-primary font-bold">Important Status Disclosure:</span> Your
              incident ticket has been logged with the regional dispatch queue. Dispatch teams
              review incoming requests based on verified water danger.
            </p>
            <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
              Rescue assets are prioritized dynamically according to rising water levels and citizen
              vulnerability. We do not claim immediate crew deployment until sector triage is
              cleared.
            </p>
          </div>
        </div>
      </section>

      {/* Grid: Ticket Details + Operational Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        {/* Left Column: Request Summary Card */}
        <section className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-outline-variant pb-4 mb-5">
              <div>
                <span className="font-mono text-xs uppercase font-bold text-on-surface-variant block">
                  OFFICIAL RECEIPT
                </span>
                <h2 className="font-manrope text-xl text-on-surface font-bold">Request Summary</h2>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300">
                Urgent (Upper Level Safe)
              </span>
            </div>

            {/* Reference Ticket ID Highlight */}
            <div className="bg-surface-container-low border border-outline-variant rounded-lg p-4 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs text-on-surface-variant block font-medium">
                  Reference Ticket ID
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className="font-manrope text-xl md:text-2xl font-bold text-primary tracking-tight"
                    id="ticket-id"
                  >
                    {ticketId}
                  </span>
                  <span className="font-mono text-[10px] font-bold uppercase bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant">
                    Simulated
                  </span>
                </div>
              </div>
              <button
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-container active:scale-95 transition-all"
                onClick={copyTicketId}
                type="button"
              >
                <span className="material-symbols-outlined text-sm">content_copy</span>
                <span>{copied ? 'Copied to Clipboard' : 'Copy Reference ID'}</span>
              </button>
            </div>

            {/* Metadata Spec List */}
            <div className="space-y-4 text-xs md:text-sm">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary text-xl mt-0.5">
                  schedule
                </span>
                <div>
                  <p className="text-xs text-on-surface-variant font-medium">Logged Timestamp</p>
                  <p className="text-on-surface font-semibold">Submitted today at 14:32 CST</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary text-xl mt-0.5">
                  pin_drop
                </span>
                <div>
                  <p className="text-xs text-on-surface-variant font-medium">
                    Reported Incident Location
                  </p>
                  <p className="text-on-surface font-semibold">
                    1428 Riverbend Dr (GPS: 29.7604° N, 95.3698° W)
                  </p>
                  <span className="text-xs text-on-surface-variant">
                    Quadrant 4B • Buffalo Bayou Sub-basin
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary text-xl mt-0.5">group</span>
                <div>
                  <p className="text-xs text-on-surface-variant font-medium">
                    Vulnerability &amp; Occupancy
                  </p>
                  <p className="text-on-surface font-semibold">
                    3 Persons (Elderly relative &amp; pets included)
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-outline-variant flex items-center justify-between text-xs text-on-surface-variant">
            <span>Relay Node: TX-EOC-HUB-09</span>
            <span className="inline-flex items-center gap-1 text-primary font-bold">
              <span className="material-symbols-outlined text-sm">verified_user</span>
              Dispatch Logged
            </span>
          </div>
        </section>

        {/* Right Column: What Happens Next */}
        <section className="lg:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="border-b border-outline-variant pb-4 mb-5">
              <span className="font-mono text-xs uppercase font-bold text-primary block">
                PROGRESSION ROADMAP
              </span>
              <h2 className="font-manrope text-xl text-on-surface font-bold">What Happens Next</h2>
            </div>

            <ol className="relative border-l border-outline-variant ml-3 space-y-6">
              {/* Step 1 */}
              <li className="pl-6 relative">
                <span className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-primary-container text-on-primary flex items-center justify-center text-xs font-bold font-mono">
                  1
                </span>
                <h3 className="text-sm font-bold text-on-surface">Triage Review</h3>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  The central dispatch team verifies incident reports, confirming coordinate
                  accuracy and life-safety priorities across all sectors.
                </p>
              </li>

              {/* Step 2 */}
              <li className="pl-6 relative">
                <span className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-surface-container-high text-on-surface-variant border border-outline-variant flex items-center justify-center text-xs font-bold font-mono">
                  2
                </span>
                <h3 className="text-sm font-bold text-on-surface">Route Inclusion</h3>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  Your ticket is sequenced into the nearest operational craft routing cluster
                  (Zodiac or high-water truck).
                </p>
              </li>

              {/* Step 3 */}
              <li className="pl-6 relative">
                <span className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-surface-container-high text-on-surface-variant border border-outline-variant flex items-center justify-center text-xs font-bold font-mono">
                  3
                </span>
                <h3 className="text-sm font-bold text-on-surface">Extraction &amp; Transport</h3>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  Assigned rescue crews approach your location and transport passengers to
                  designated safe relief shelters.
                </p>
              </li>
            </ol>
          </div>

          <div className="mt-8 pt-4 border-t border-outline-variant">
            <Link
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-surface-container text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors"
              href="/citizen"
            >
              <span>Return to Public Portal</span>
              <span className="material-symbols-outlined text-sm">home</span>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
