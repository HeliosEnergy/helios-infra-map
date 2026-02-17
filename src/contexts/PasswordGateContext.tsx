import { createContext, useContext } from 'react';

type PasswordGateContextValue = {
  isGateEnabled: boolean;
  isAuthenticated: boolean;
  authToken: string | null;
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  lockApp: () => void;
};

const noop = () => {};
const defaultFetch = (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init);

const PasswordGateContext = createContext<PasswordGateContextValue>({
  isGateEnabled: false,
  isAuthenticated: true,
  authToken: null,
  authenticatedFetch: defaultFetch,
  lockApp: noop,
});

export const usePasswordGate = () => useContext(PasswordGateContext);

type ProviderProps = {
  value: PasswordGateContextValue;
  children: React.ReactNode;
};

export const PasswordGateProvider = ({ value, children }: ProviderProps) => (
  <PasswordGateContext.Provider value={value}>{children}</PasswordGateContext.Provider>
);
