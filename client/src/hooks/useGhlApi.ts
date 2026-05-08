import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useAccountAuth } from '@/contexts/AccountAuthContext';

export interface UseGhlApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: Record<string, any>;
  params?: Record<string, any>;
}

export interface UseGhlApiResponse<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: () => Promise<T | null>;
}

const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';

export function useGhlApi<T>(
  endpoint: string,
  options: UseGhlApiOptions = {}
): UseGhlApiResponse<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { locationToken, setLocationToken, retryTokenFetch } = useAccountAuth();

  const execute = useCallback(async (): Promise<T | null> => {
    if (!locationToken) {
      setError('No authentication token available');
      toast.error('Not authenticated. Please refresh the page.');
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      const url = new URL(endpoint.startsWith('http') ? endpoint : `${GHL_BASE}${endpoint}`);
      
      if (options.params) {
        Object.entries(options.params).forEach(([key, value]) => {
          url.searchParams.append(key, String(value));
        });
      }

      const response = await fetch(url.toString(), {
        method: options.method || 'GET',
        headers: {
          'Authorization': `Bearer ${locationToken}`,
          'Version': API_VERSION,
          'Content-Type': 'application/json',
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      // Handle 401 - token expired, try to refresh
      if (response.status === 401) {
        try {
          await retryTokenFetch();
          // Retry the call with the new token
          return execute();
        } catch (err) {
          toast.error('Session expired. Please refresh the page.');
          setError('Unauthorized');
          return null;
        }
      }

      // Handle 403 - permission denied
      if (response.status === 403) {
        toast.error('You do not have permission to perform this action.');
        setError('Permission denied');
        return null;
      }

      if (!response.ok) {
        let errorMessage = 'An error occurred';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch {
          errorMessage = `HTTP ${response.status}`;
        }

        // Don't show toast for 422 - let components handle field-level errors
        if (response.status !== 422) {
          toast.error(errorMessage);
        }

        setError(errorMessage);
        return null;
      }

      const result = await response.json();
      setData(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setError(message);
      toast.error('Network error. Please check your connection.');
      console.error('API call error:', message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [locationToken, endpoint, options, setLocationToken, retryTokenFetch]);

  return { data, loading, error, execute };
}
