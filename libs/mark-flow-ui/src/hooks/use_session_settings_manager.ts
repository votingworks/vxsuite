import React from 'react';
import { DefaultTheme } from 'styled-components';

import { isCardlessVoterAuth } from '@votingworks/utils';
import {
  VoterSettingsManagerContext,
  useAudioControls,
  useAudioEnabled,
  useCurrentLanguage,
  useCurrentTheme,
  useLanguageControls,
} from '@votingworks/ui';
import {
  InsertedSmartCardAuth,
  LanguageCode,
  VotesDict,
} from '@votingworks/types';

export interface UseSessionSettingsManagerParams {
  authStatus: InsertedSmartCardAuth.AuthStatus;
  votes?: VotesDict;
}

interface VoterSettings {
  isAudioEnabled: boolean;
  language: LanguageCode;
  theme: DefaultTheme;
}

export function useSessionSettingsManager(
  params: UseSessionSettingsManagerParams
): void {
  const { authStatus, votes } = params;

  const previousAuthStatusRef =
    React.useRef<InsertedSmartCardAuth.AuthStatus>();
  const voterSettingsRef = React.useRef<VoterSettings>();

  const voterSettingsManager = React.useContext(VoterSettingsManagerContext);
  const currentTheme = useCurrentTheme();

  const { reset: resetAudioSettings, setIsEnabled: setAudioEnabled } =
    useAudioControls();
  const { reset: resetLanguage, setLanguage } = useLanguageControls();
  const currentLanguage = useCurrentLanguage();
  const isAudioEnabled = useAudioEnabled();

  const wasPreviouslyLoggedInAsVoter =
    previousAuthStatusRef.current &&
    isCardlessVoterAuth(previousAuthStatusRef.current);
  const isLoggedInAsVoter = isCardlessVoterAuth(authStatus);
  const isVotingSessionActive = !!votes;

  React.useEffect(() => {
    // Reset to default settings and disable audio when election official logs
    // in during a voter session:
    if (wasPreviouslyLoggedInAsVoter && !isLoggedInAsVoter) {
      voterSettingsRef.current = {
        isAudioEnabled,
        language: currentLanguage,
        theme: currentTheme,
      };
      voterSettingsManager.resetThemes();
      resetLanguage();
      setAudioEnabled(false);
    }

    if (
      !wasPreviouslyLoggedInAsVoter &&
      isLoggedInAsVoter &&
      voterSettingsRef.current
    ) {
      const voterSettings = voterSettingsRef.current;
      if (isVotingSessionActive) {
        // Reset to previous voter settings for the active voter session when
        // when election official logs out:
        voterSettingsManager.setColorMode(voterSettings.theme.colorMode);
        voterSettingsManager.setSizeMode(voterSettings.theme.sizeMode);
        setLanguage(voterSettings.language);
        setAudioEnabled(voterSettings.isAudioEnabled);
      } else {
        // [VVSG 2.0 7.1-A] Reset themes to default if this is a new voting
        // session:
        voterSettingsManager.resetThemes();
        resetAudioSettings();
        resetLanguage();
      }
      voterSettingsRef.current = undefined;
    }

    previousAuthStatusRef.current = authStatus;
  }, [
    authStatus,
    currentLanguage,
    currentTheme,
    isAudioEnabled,
    isLoggedInAsVoter,
    isVotingSessionActive,
    resetAudioSettings,
    resetLanguage,
    setAudioEnabled,
    setLanguage,
    voterSettingsManager,
    wasPreviouslyLoggedInAsVoter,
  ]);
}
