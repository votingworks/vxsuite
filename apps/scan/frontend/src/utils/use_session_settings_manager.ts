import React from 'react';
import {
  VoterSettingsManagerContext,
  useAudioControls,
  useAudioEnabled,
  useCurrentLanguage,
  useLanguageControls,
} from '@votingworks/ui';
import { DefaultTheme, ThemeContext } from 'styled-components';

export interface SessionSettingsManagerProps {
  startNewSession: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
}

/**
 * useSessionSettingsManager manages voter settings session state that can be cached and restored
 * (i.e. needed when an election official interrupts a voter session)
 */
export function useSessionSettingsManager(): SessionSettingsManagerProps {
  const audioContext = useAudioControls();
  const languageContext = useLanguageControls();
  const voterSettingsContext = React.useContext(VoterSettingsManagerContext);
  const isAudioEnabled = useAudioEnabled();
  const currentLanguage = useCurrentLanguage();
  const currentTheme = React.useContext(ThemeContext);

  // Voter session specific settings, saved to return to after auth-ed sessions
  const [savedIsAudioEnabled, setSavedIsAudioEnabled] = React.useState<
    boolean | null
  >(null);
  const [savedVoterSessionLanguage, setSavedVoterSessionLanguage] =
    React.useState<string | null>(null);
  const [savedVoterSessionTheme, setSavedVoterSessionTheme] =
    React.useState<DefaultTheme | null>(null);

  function startNewSession() {
    audioContext.reset();
    languageContext.reset();
    voterSettingsContext.resetThemes();

    setSavedIsAudioEnabled(null);
    setSavedVoterSessionLanguage(null);
    setSavedVoterSessionTheme(null);
  }

  function pauseSession() {
    setSavedIsAudioEnabled(isAudioEnabled);
    setSavedVoterSessionLanguage(currentLanguage);
    setSavedVoterSessionTheme(currentTheme);

    audioContext.reset();
    languageContext.reset();
    voterSettingsContext.resetThemes();
  }

  function resumeSession() {
    if (savedIsAudioEnabled !== null) {
      audioContext.setIsEnabled(savedIsAudioEnabled);
    }
    if (savedVoterSessionLanguage) {
      languageContext.setLanguage(savedVoterSessionLanguage);
    }
    if (savedVoterSessionTheme) {
      voterSettingsContext.setColorMode(savedVoterSessionTheme.colorMode);
      voterSettingsContext.setSizeMode(savedVoterSessionTheme.sizeMode);
      voterSettingsContext.setIsVisualModeDisabled(
        savedVoterSessionTheme.isVisualModeDisabled
      );
    }

    setSavedIsAudioEnabled(null);
    setSavedVoterSessionLanguage(null);
    setSavedVoterSessionTheme(null);
  }

  return {
    startNewSession,
    pauseSession,
    resumeSession,
  };
}
