import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface AccountAuthContextType {
  locationId: string | null;
  locationToken: string | null;
  loading: boolean;
  error: string | null;
  setLocationToken: (token: string) => void;
  retryTokenFetch: () => Promise<void>;
}

const AccountAuthContext = createContext<AccountAuthContextType | undefined>(undefined);

export function AccountAuthProvider({ children }: { children: ReactNode }) {
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationToken, setLocationToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLocationToken = async (locId: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/auth/location-token?locationId=${locId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch location token');
      }
      
      const data = await response.json();
      setLocationToken(data.access_token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      console.error('Token fetch error:', message);
    } finally {
      setLoading(false);
    }
  };

  const retryTokenFetch = async () => {
    if (locationId) {
      await fetchLocationToken(locationId);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const locId = params.get('locationId');
    
    if (!locId) {
      setError('No locationId provided');
      setLoading(false);
      return;
    }
    
    setLocationId(locId);
    fetchLocationToken(locId);
  }, []);

  return (
    <AccountAuthContext.Provider
      value={{
        locationId,
        locationToken,
        loading,
        error,
        setLocationToken,
        retryTokenFetch,
      }}
    >
      {children}
    </AccountAuthContext.Provider>
  );
}

export function useAccountAuth() {
  const context = useContext(AccountAuthContext);
  if (!context) {
    throw new Error('useAccountAuth must be used within AccountAuthProvider');
  }
  return context;
}
