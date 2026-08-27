import { useCallback, useEffect, useState } from 'react';
import './PasswordGate.css';
import { PasswordGateProvider } from '../contexts/PasswordGateContext';
import {
  AUTH_EXPIRED_EVENT,
  authenticatedFetch as authenticatedFetchWithToken,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from '../utils/auth';

type PasswordGateProps = {
  children: React.ReactNode;
};

const HEARTBEAT_INTERVAL_MS = 3 * 60_000;

const PasswordGate = ({ children }: PasswordGateProps) => {
  const [email, setEmail] = useState('');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [authToken, setAuthTokenState] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  const isGateEnabled = true;
  const isAuthenticated = isUnlocked && !!authToken;

  const handleLogout = useCallback(() => {
    clearAuthToken();
    setAuthTokenState(null);
    setEmail('');
    setInput('');
    setError('');
    setInfo('');
    setIsUnlocked(false);
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setError('Session expired. Please unlock again.');
      handleLogout();
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [handleLogout]);

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
    setInfo('');

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: input.trim() }),
      });

      if (response.status === 401) {
        setError('Incorrect password. Please try again.');
        return;
      }

      if (!response.ok) {
        let message = 'Authentication failed. Please try again.';
        try {
          const data = (await response.json()) as { error?: string };
          if (typeof data.error === 'string' && data.error.trim()) {
            message = data.error;
          }
        } catch {
          // Ignore parse errors and use generic fallback.
        }
        setError(message);
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
      setEmail('');
      setInput('');
    } catch {
      setError('Authentication request failed. Please check your connection.');
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    const sendHeartbeat = async () => {
      if (document.visibilityState !== 'visible') return;

      try {
        await authenticatedFetchWithToken('/api/usage/heartbeat', { method: 'POST' });
      } catch {
        // Usage tracking should never interrupt the map experience.
      }
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, authToken]);

  const handleRequestAccess = async () => {
    setError('');
    setInfo('');

    const normalizedEmail = email.trim().toLowerCase();
    const password = input.trim();
    if (!normalizedEmail || !password) {
      setError('Enter your email and a password to request access.');
      return;
    }

    try {
      const response = await fetch('/api/access-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Failed to submit access request.');
        return;
      }

      setInfo('Access request submitted. We will review and approve by email.');
    } catch {
      setError('Could not submit access request right now.');
    }
  };

  const overlay = (
    <div className="password-gate">
      <div className="password-gate-card">
        <h1>Helios Energy</h1>
        <p>Sign in with approved email access, or request temporary access.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="app-email">Email</label>
          <input
            id="app-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@company.com"
            required
          />
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
          {info && <p className="password-gate-info">{info}</p>}
          <button type="submit">Unlock</button>
          <button type="button" className="secondary-button" onClick={handleRequestAccess}>
            Request Access
          </button>
        </form>
      </div>
    </div>
  );

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
