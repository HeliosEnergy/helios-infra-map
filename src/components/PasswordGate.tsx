import { useCallback, useEffect, useState } from 'react';
import './PasswordGate.css';
import { PasswordGateProvider } from '../contexts/PasswordGateContext';
import { authClient } from '../lib/auth-client';
import { AUTH_EXPIRED_EVENT, authenticatedFetch } from '../utils/auth';

type PasswordGateProps = {
  children: React.ReactNode;
};

type AuthMode = 'sign-in' | 'sign-up';

const PasswordGate = ({ children }: PasswordGateProps) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: session, isPending, refetch } = authClient.useSession();

  const isGateEnabled = true;
  const isAuthenticated = Boolean(session?.user);

  const handleLogout = useCallback(() => {
    setEmail('');
    setName('');
    setPassword('');
    setError('');
    setInfo('');
    void authClient.signOut();
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setError('Session expired. Please sign in again.');
      handleLogout();
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [handleLogout]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
    setInfo('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setInfo('');
    setIsSubmitting(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const trimmedPassword = password.trim();

      if (mode === 'sign-up') {
        const { error: signUpError } = await authClient.signUp.email({
          email: normalizedEmail,
          password: trimmedPassword,
          name: name.trim() || normalizedEmail,
        });

        if (signUpError) {
          setError(signUpError.message || 'Could not create an account for this email.');
          return;
        }

        setInfo('Account created. You are signed in.');
      } else {
        const { error: signInError } = await authClient.signIn.email({
          email: normalizedEmail,
          password: trimmedPassword,
        });

        if (signInError) {
          setError(signInError.message || 'Incorrect email or password.');
          return;
        }
      }

      await refetch();
      setEmail('');
      setName('');
      setPassword('');
    } catch {
      setError('Authentication request failed. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const overlay = (
    <div className="password-gate">
      <div className="password-gate-card">
        <h1>Helios Energy</h1>
        <p>Sign in with an approved email to continue.</p>
        <div className="password-gate-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={mode === 'sign-in' ? 'active' : ''}
            onClick={() => switchMode('sign-in')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'sign-up' ? 'active' : ''}
            onClick={() => switchMode('sign-up')}
          >
            Create account
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {mode === 'sign-up' && (
            <>
              <label htmlFor="app-name">Name</label>
              <input
                id="app-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                placeholder="Your name"
                required
              />
            </>
          )}
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
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            placeholder="Enter password"
            required
          />
          {error && <p className="password-gate-error">{error}</p>}
          {info && <p className="password-gate-info">{info}</p>}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait...' : mode === 'sign-up' ? 'Create account' : 'Unlock'}
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
        authenticatedFetch,
        lockApp: handleLogout,
      }}
    >
      {isPending ? null : isGateEnabled && !isAuthenticated ? overlay : children}
    </PasswordGateProvider>
  );
};

export default PasswordGate;
