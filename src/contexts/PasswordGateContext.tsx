import { createContext, useContext } from 'react';

type PasswordGateContextValue = {
  isGateEnabled: boolean;
  lockApp: () => void;
};

const noop = () => {};

const PasswordGateContext = createContext<PasswordGateContextValue>({
  isGateEnabled: false,
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

