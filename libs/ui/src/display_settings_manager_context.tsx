// istanbul ignore file: tested via AppBase
import React from 'react';

import { ColorMode, SizeMode } from '@votingworks/types';

/** Provides an API for managing themes. */
export interface DisplaySettingsManagerContextInterface {
  /** Restores themes to their initial default state. */
  resetThemes: () => void;

  /** Switches over to the specified color theme. */
  setColorMode: (mode: ColorMode) => void;

  /** Switches over to the specified size theme. */
  setSizeMode: (mode: SizeMode) => void;

  /** Toggles a full screen overlay that visually blocks underlying elements but keeps them in the accessibility tree */
  setIsVisualModeDisabled: (isDisabled: boolean) => void;
}

/** Context instance for {@link DisplaySettingsManagerContextInterface}. */
export const DisplaySettingsManagerContext =
  React.createContext<DisplaySettingsManagerContextInterface>({
    resetThemes: () => undefined,
    setColorMode: () => undefined,
    setSizeMode: () => undefined,
    setIsVisualModeDisabled: () => undefined,
  });
