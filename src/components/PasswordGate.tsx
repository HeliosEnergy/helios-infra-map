import { useEffect, useMemo, useState } from 'react';
import './PasswordGate.css';
import { PasswordGateProvider } from '../contexts/PasswordGateContext';

type PasswordGateProps = {
  children: React.ReactNode;
};

const STORAGE_KEY = 'helios-map-authenticated';

/** Set to true to disable the password gate (e.g. when Vercel env cannot be updated). Flip back to false to re-enable. */
const PASSWORD_GATE_DISABLED = true;

/** Parse VITE_APP_PASSWORD: single value or comma-separated list (trimmed). */
const parseAllowedPasswords = (raw: string | undefined): string[] => {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
};

const PasswordGate = ({ children }: PasswordGateProps) => {
  const allowedPasswords = useMemo(
    () => parseAllowedPasswords(import.meta.env.VITE_APP_PASSWORD),
    []
  );
  const isGateEnabled = !PASSWORD_GATE_DISABLED && allowedPasswords.length > 0;
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(() => {
    if (!isGateEnabled || typeof window === 'undefined') {
      return true;
    }
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    if (!isGateEnabled) {
      setIsUnlocked(true);
      return;
    }
    if (window.localStorage.getItem(STORAGE_KEY) === 'true') {
      setIsUnlocked(true);
    }
  }, [isGateEnabled]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!isGateEnabled) {
      setIsUnlocked(true);
      return;
    }

    const trimmed = input.trim();
    if (allowedPasswords.some((p) => trimmed === p)) {
      window.localStorage.setItem(STORAGE_KEY, 'true');
      setIsUnlocked(true);
      setInput('');
      return;
    }

    setError('Incorrect password. Please try again.');
  };

  const handleLogout = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setInput('');
    setIsUnlocked(false);
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

  return (
    <PasswordGateProvider value={{ isGateEnabled, lockApp: handleLogout }}>
      {isGateEnabled && !isUnlocked ? overlay : children}
    </PasswordGateProvider>
  );
};

export default PasswordGate;


