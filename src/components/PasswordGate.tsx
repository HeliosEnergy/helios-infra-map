import { useCallback, useEffect, useState } from 'react';
import './PasswordGate.css';
import { PasswordGateProvider } from '../contexts/PasswordGateContext';
import {
  authenticatedFetch as authenticatedFetchWithToken,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from '../utils/auth';

type PasswordGateProps = {
  children: React.ReactNode;
};

const PasswordGate = ({ children }: PasswordGateProps) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [authToken, setAuthTokenState] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  const isGateEnabled = true;

  const handleLogout = useCallback(() => {
    clearAuthToken();
    setAuthTokenState(null);
    setInput('');
    setError('');
    setIsUnlocked(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const validateExistingSession = async () => {
      try {
        const token = getAuthToken();
        if (!token) {
          if (!cancelled) setIsUnlocked(false);
          return;
        }

        const response = await fetch('/api/auth', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          handleLogout();
          return;
        }

        const data = (await response.json()) as { authenticated?: boolean };
        if (data.authenticated) {
          if (!cancelled) {
            setAuthTokenState(token);
            setIsUnlocked(true);
          }
        } else {
          handleLogout();
        }
      } catch {
        handleLogout();
      } finally {
        if (!cancelled) {
          setIsCheckingAuth(false);
        }
      }
    };

    validateExistingSession();

    return () => {
      cancelled = true;
    };
  }, [handleLogout]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: input.trim() }),
      });

      if (response.status === 401) {
        setError('Incorrect password. Please try again.');
        return;
      }

      if (!response.ok) {
        setError('Authentication failed. Please try again.');
        return;
      }

      const data = (await response.json()) as { token?: string };
      if (!data.token) {
        setError('Authentication failed. Please try again.');
        return;
      }

      setAuthToken(data.token);
      setAuthTokenState(data.token);
      setIsUnlocked(true);
      setInput('');
    } catch {
      setError('Authentication request failed. Please check your connection.');
    }
  };

  const overlay = (
    <div className="password-gate">
      <div className="password-gate-card">
        <h1>Helios Energy</h1>
        <p>Please enter the access password to continue.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="app-password">Password</label>
          <input
            id="app-password"
            type="password"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            autoComplete="current-password"
            placeholder="Enter password"
            required
          />
          {error && <p className="password-gate-error">{error}</p>}
          <button type="submit">Unlock</button>
        </form>
      </div>
    </div>
  );

  const isAuthenticated = isUnlocked && !!authToken;

  return (
    <PasswordGateProvider
      value={{
        isGateEnabled,
        isAuthenticated,
        authToken,
        authenticatedFetch: authenticatedFetchWithToken,
        lockApp: handleLogout,
      }}
    >
      {isCheckingAuth ? null : isGateEnabled && !isUnlocked ? overlay : children}
    </PasswordGateProvider>
  );
};

export default PasswordGate;
