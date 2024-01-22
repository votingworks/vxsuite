import React from 'react';
import { DefaultTheme, ThemeContext } from 'styled-components';

import { isCardlessVoterAuth } from '@votingworks/utils';
import { DisplaySettingsManagerContext } from '@votingworks/ui';
import { InsertedSmartCardAuth, VotesDict } from '@votingworks/types';

export interface UseDisplaySettingsManagerParams {
  authStatus: InsertedSmartCardAuth.AuthStatus;
  votes?: VotesDict;
}

export function useDisplaySettingsManager(
  params: UseDisplaySettingsManagerParams
): void {
  const { authStatus, votes } = params;

  const previousAuthStatus = React.useRef<InsertedSmartCardAuth.AuthStatus>();

  const displaySettingsManager = React.useContext(
    DisplaySettingsManagerContext
  );
  const currentTheme = React.useContext(ThemeContext);
  const [voterSessionTheme, setVoterSessionTheme] =
    React.useState<DefaultTheme | null>(null);

  React.useEffect(() => {
    const wasPreviouslyLoggedInAsVoter =
      previousAuthStatus.current &&
      isCardlessVoterAuth(previousAuthStatus.current);
    const isLoggedInAsVoter = isCardlessVoterAuth(authStatus);
    const isVotingSessionActive = !!votes;

    // Reset to default theme when election official logs in, since
    // non-voter-facing screens are not optimised for larger text sizes:
    if (wasPreviouslyLoggedInAsVoter && !isLoggedInAsVoter) {
      setVoterSessionTheme(currentTheme);
      displaySettingsManager.resetThemes();
    }

    if (
      !wasPreviouslyLoggedInAsVoter &&
      isLoggedInAsVoter &&
      voterSessionTheme
    ) {
      if (isVotingSessionActive) {
        // Reset to previous display settings for the active voter session when
        // when election official logs out:
        displaySettingsManager.setColorMode(voterSessionTheme.colorMode);
        displaySettingsManager.setSizeMode(voterSessionTheme.sizeMode);
      } else {
        // [VVSG 2.0 7.1-A] Reset themes to default if this is a new voting
        // session:
        displaySettingsManager.resetThemes();
      }
      setVoterSessionTheme(null);
    }

    previousAuthStatus.current = authStatus;
  }, [
    authStatus,
    currentTheme,
    displaySettingsManager,
    voterSessionTheme,
    votes,
  ]);
}
