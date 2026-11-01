'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import type { OperatorProfile } from '@/lib/api/types';
import { ApiClientError } from '@/lib/api/errors';

interface OperatorAuthContextValue {
  operator: OperatorProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const OperatorAuthContext = createContext<OperatorAuthContextValue | undefined>(undefined);

export function OperatorAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [operator, setOperator] = useState<OperatorProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const checkSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const profile = await apiClient.getMe();
      setOperator(profile);
    } catch {
      // 401 or network error -> not authenticated
      setOperator(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = useCallback(
    async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
      try {
        setIsLoading(true);
        const result = await apiClient.login(username, password);
        setOperator(result.operator);
        return { success: true };
      } catch (err) {
        setOperator(null);
        if (err instanceof ApiClientError) {
          return { success: false, error: err.message };
        }
        return {
          success: false,
          error: (err as Error).message || 'Failed to authenticate operator',
        };
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      setIsLoading(true);
      await apiClient.logout();
    } catch {
      // ignore
    } finally {
      setOperator(null);
      setIsLoading(false);
      router.push('/operator/login');
    }
  }, [router]);

  const value: OperatorAuthContextValue = {
    operator,
    isLoading,
    isAuthenticated: Boolean(operator),
    login,
    logout,
    refreshSession: checkSession,
  };

  return <OperatorAuthContext.Provider value={value}>{children}</OperatorAuthContext.Provider>;
}

export function useOperatorAuth(): OperatorAuthContextValue {
  const context = useContext(OperatorAuthContext);
  if (!context) {
    throw new Error('useOperatorAuth must be used within an OperatorAuthProvider');
  }
  return context;
}
