import React from 'react';
import {
  DisplaySettingsManagerContext,
  useQueryChangeListener,
} from '@votingworks/ui';
import { DefaultTheme, ThemeContext } from 'styled-components';
import { getAuthStatus, getScannerStatus } from '../api';

/**
 * Side-effect component for monitoring for auth and voter session changes and
 * resetting/restoring voter display settings as needed.
 */
export function DisplaySettingsManager(): JSX.Element | null {
  const displaySettingsManager = React.useContext(
    DisplaySettingsManagerContext
  );
  const currentTheme = React.useContext(ThemeContext);

  const authStatusQuery = getAuthStatus.useQuery();
  const scannerStatusQuery = getScannerStatus.useQuery();

  const [voterSessionTheme, setVoterSessionTheme] =
    React.useState<DefaultTheme | null>(null);

  useQueryChangeListener(authStatusQuery, {
    select: ({ status }) => status,
    onChange: (newStatus, previousStatus) => {
      // Reset to default theme when election official logs in:
      if (previousStatus === 'logged_out') {
        setVoterSessionTheme(currentTheme);
        displaySettingsManager.resetThemes();
      }

      // Reset to previous voter settings when election official logs out:
      if (newStatus === 'logged_out' && voterSessionTheme) {
        displaySettingsManager.setColorMode(voterSessionTheme.colorMode);
        displaySettingsManager.setSizeMode(voterSessionTheme.sizeMode);
        setVoterSessionTheme(null);
      }
    },
  });

  // [VVSG 2.0 7.1-A] Reset to default theme when voter is done scanning. We
  // have chosen to interpret that as whenever paper leaves the scanner (either
  // into the ballot box, or retrieved by the user after a ballot rejection).
  useQueryChangeListener(scannerStatusQuery, {
    select: ({ state }) => state,
    onChange: (newState, previousState) => {
      if (previousState && newState === 'no_paper') {
        displaySettingsManager.resetThemes();
      }
    },
  });

  return null;
}
