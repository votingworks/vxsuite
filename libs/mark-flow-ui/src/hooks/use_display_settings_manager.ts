import React from 'react';
import { DefaultTheme, ThemeContext } from 'styled-components';

import { isCardlessVoterAuth } from '@votingworks/utils';
import { ThemeManagerContext } from '@votingworks/ui';
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

  const themeManager = React.useContext(ThemeManagerContext);
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
      themeManager.resetThemes();
    }

    if (
      !wasPreviouslyLoggedInAsVoter &&
      isLoggedInAsVoter &&
      voterSessionTheme
    ) {
      if (isVotingSessionActive) {
        // Reset to previous display settings for the active voter session when
        // when election official logs out:
        themeManager.setColorMode(voterSessionTheme.colorMode);
        themeManager.setSizeMode(voterSessionTheme.sizeMode);
      } else {
        // [VVSG 2.0 7.1-A] Reset themes to default if this is a new voting
        // session:
        themeManager.resetThemes();
      }
      setVoterSessionTheme(null);
    }

    previousAuthStatus.current = authStatus;
  }, [authStatus, currentTheme, themeManager, voterSessionTheme, votes]);
}
