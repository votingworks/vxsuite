import React from 'react';
import { DefaultTheme } from 'styled-components';

import { isCardlessVoterAuth } from '@votingworks/utils';
import {
  DisplaySettingsManagerContext,
  useAudioControls,
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

  const displaySettingsManager = React.useContext(
    DisplaySettingsManagerContext
  );
  const currentTheme = useCurrentTheme();

  const { reset: resetAudioSettings } = useAudioControls();
  const { reset: resetLanguage, setLanguage } = useLanguageControls();
  const currentLanguage = useCurrentLanguage();

  React.useEffect(() => {
    const wasPreviouslyLoggedInAsVoter =
      previousAuthStatusRef.current &&
      isCardlessVoterAuth(previousAuthStatusRef.current);
    const isLoggedInAsVoter = isCardlessVoterAuth(authStatus);
    const isVotingSessionActive = !!votes;

    // Reset to default settings and disable audio when election official logs
    // in during a voter session:
    if (wasPreviouslyLoggedInAsVoter && !isLoggedInAsVoter) {
      voterSettingsRef.current = {
        language: currentLanguage,
        theme: currentTheme,
      };
      displaySettingsManager.resetThemes();
      resetLanguage();
    }

    if (
      !wasPreviouslyLoggedInAsVoter &&
      isLoggedInAsVoter &&
      voterSettingsRef.current
    ) {
      const voterSettings = voterSettingsRef.current;
      if (isVotingSessionActive) {
        // Reset to previous display settings for the active voter session when
        // when election official logs out:
        displaySettingsManager.setColorMode(voterSettings.theme.colorMode);
        displaySettingsManager.setSizeMode(voterSettings.theme.sizeMode);
        setLanguage(voterSettings.language);
      } else {
        // [VVSG 2.0 7.1-A] Reset themes to default if this is a new voting
        // session:
        displaySettingsManager.resetThemes();
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
    displaySettingsManager,
    resetAudioSettings,
    resetLanguage,
    setLanguage,
    votes,
  ]);
}
