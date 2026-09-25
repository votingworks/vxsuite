import React from 'react';
import { AppKeybindings, DEFAULT_KEYBINDINGS } from './keybindings.js';

const KeybindingsContext =
  React.createContext<AppKeybindings>(DEFAULT_KEYBINDINGS);

export interface KeybindingsProviderProps {
  keybindings: AppKeybindings;
  children: React.ReactNode;
}

export function KeybindingsProvider({
  keybindings,
  children,
}: KeybindingsProviderProps): JSX.Element {
  return (
    <KeybindingsContext.Provider value={keybindings}>
      {children}
    </KeybindingsContext.Provider>
  );
}

export function useKeybindings(): AppKeybindings {
  return React.useContext(KeybindingsContext);
}
