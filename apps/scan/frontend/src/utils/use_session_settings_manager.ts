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
  /** Whether the PAT calibration tutorial is currently being shown */
  showingPatCalibration: boolean;
  /** Set whether the PAT calibration tutorial is being shown */
  setShowingPatCalibration: (showing: boolean) => void;
  /** Whether PAT calibration has been completed for this session */
  isPatCalibrationComplete: boolean;
  /** Mark PAT calibration as complete for this session */
  setIsPatCalibrationComplete: (complete: boolean) => void;
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

  // PAT device calibration state
  const [showingPatCalibration, setShowingPatCalibration] =
    React.useState(false);
  const [isPatCalibrationComplete, setIsPatCalibrationComplete] =
    React.useState(false);
  // Save calibration completion state to restore after election official interruption
  const [savedIsPatCalibrationComplete, setSavedIsPatCalibrationComplete] =
    React.useState<boolean | null>(null);

  function startNewSession() {
    audioContext.reset();
    languageContext.reset();
    voterSettingsContext.resetThemes();

    setSavedIsAudioEnabled(null);
    setSavedVoterSessionLanguage(null);
    setSavedVoterSessionTheme(null);

    // Reset PAT calibration state for new session
    setShowingPatCalibration(false);
    setIsPatCalibrationComplete(false);
    setSavedIsPatCalibrationComplete(null);
  }

  function pauseSession() {
    setSavedIsAudioEnabled(isAudioEnabled);
    setSavedVoterSessionLanguage(currentLanguage);
    setSavedVoterSessionTheme(currentTheme);

    // Save PAT calibration completion state (so voter doesn't redo tutorial after interruption)
    setSavedIsPatCalibrationComplete(isPatCalibrationComplete);

    audioContext.reset();
    languageContext.reset();
    voterSettingsContext.resetThemes();

    // Hide PAT calibration during pause (election official session)
    setShowingPatCalibration(false);
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

    // Restore PAT calibration completion state
    if (savedIsPatCalibrationComplete !== null) {
      setIsPatCalibrationComplete(savedIsPatCalibrationComplete);
    }

    setSavedIsAudioEnabled(null);
    setSavedVoterSessionLanguage(null);
    setSavedVoterSessionTheme(null);
    setSavedIsPatCalibrationComplete(null);
  }

  return {
    startNewSession,
    pauseSession,
    resumeSession,
    showingPatCalibration,
    setShowingPatCalibration,
    isPatCalibrationComplete,
    setIsPatCalibrationComplete,
  };
}
