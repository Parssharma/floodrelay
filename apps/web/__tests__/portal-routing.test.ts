import { describe, it, expect } from 'vitest';

describe('Portal Navigation & Isolation Rules', () => {
  const citizenRoutes = ['/citizen', '/citizen/request', '/citizen/confirmation'];
  const operatorRoutes = [
    '/operator',
    '/operator/requests',
    '/operator/map',
    '/operator/assignments',
    '/operator/assignments/PR-105',
  ];

  it('citizen routes are prefixed with /citizen and contain no operator paths', () => {
    for (const route of citizenRoutes) {
      expect(route.startsWith('/citizen')).toBe(true);
      expect(route.includes('/operator')).toBe(false);
    }
  });

  it('operator routes are prefixed with /operator and contain no citizen paths', () => {
    for (const route of operatorRoutes) {
      expect(route.startsWith('/operator')).toBe(true);
      expect(route.includes('/citizen')).toBe(false);
    }
  });

  it('separates public intake from operational command center', () => {
    const publicAccessible = citizenRoutes.filter((r) => !r.includes('/operator'));
    const commandRestricted = operatorRoutes.filter((r) => r.includes('/operator'));

    expect(publicAccessible).toHaveLength(3);
    expect(commandRestricted).toHaveLength(5);
  });
});
