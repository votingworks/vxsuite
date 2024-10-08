import React from 'react';
import {
  VoterSettingsManagerContext,
  useCurrentLanguage,
  useLanguageControls,
} from '@votingworks/ui';
import { DefaultTheme, ThemeContext } from 'styled-components';
import { LanguageCode } from '@votingworks/types';

export interface SessionSettingsManagerProps {
  resetVoterSettings: () => void;
  cacheAndResetVoterSettings: () => void;
  restoreVoterSessionsSettings: () => void;
}

/**
 * useSessionSettingsManager manages voter settings session state that can be cached and restored
 * (i.e. needed when an election official interrupts a voter session)
 */
export function useSessionSettingsManager(): SessionSettingsManagerProps {
  const languageContext = useLanguageControls();
  const voterSettingsContext = React.useContext(VoterSettingsManagerContext);
  const currentLanguage = useCurrentLanguage();
  const currentTheme = React.useContext(ThemeContext);

  // Voter session specific settings, saved to return to after auth-ed sessions
  const [savedVoterSessionTheme, setSavedVoterSessionTheme] =
    React.useState<DefaultTheme | null>(null);
  const [savedVoterSessionLanguage, setSavedVoterSessionLanguage] =
    React.useState<LanguageCode | null>(null);

  function resetVoterSettings() {
    languageContext.reset();
    voterSettingsContext.resetThemes();
    setSavedVoterSessionLanguage(null);
    setSavedVoterSessionTheme(null);
  }

  function cacheAndResetVoterSettings() {
    setSavedVoterSessionTheme(currentTheme);
    setSavedVoterSessionLanguage(currentLanguage);
    voterSettingsContext.resetThemes();
    languageContext.reset();
  }

  function restoreVoterSessionsSettings() {
    if (savedVoterSessionTheme) {
      voterSettingsContext.setColorMode(savedVoterSessionTheme.colorMode);
      voterSettingsContext.setSizeMode(savedVoterSessionTheme.sizeMode);
    }
    if (savedVoterSessionLanguage) {
      languageContext.setLanguage(savedVoterSessionLanguage);
    }
    setSavedVoterSessionTheme(null);
    setSavedVoterSessionLanguage(null);
  }

  return {
    resetVoterSettings,
    cacheAndResetVoterSettings,
    restoreVoterSessionsSettings,
  };
}
