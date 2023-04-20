// istanbul ignore file: tested via AppBase
import React from 'react';

import { ColorMode, SizeMode } from '@votingworks/types';

/** Provides an API for managing themes. */
export interface ThemeManagerContextInterface {
  /** Restores themes to their initial default state. */
  resetThemes: () => void;

  /** Switches over to the specified color theme. */
  setColorMode: (mode: ColorMode) => void;

  /** Switches over to the specified size theme. */
  setSizeMode: (mode: SizeMode) => void;
}

/** Context instance for {@link ThemeManagerContextInterface}. */
export const ThemeManagerContext =
  React.createContext<ThemeManagerContextInterface>({
    resetThemes: () => undefined,
    setColorMode: () => undefined,
    setSizeMode: () => undefined,
  });
