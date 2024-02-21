import React from 'react';
import {
  VoterSettingsManagerContext,
  useQueryChangeListener,
} from '@votingworks/ui';
import { DefaultTheme, ThemeContext } from 'styled-components';
import { getAuthStatus, getScannerStatus } from '../api';

/**
 * Side-effect component for monitoring for auth and voter session changes and
 * resetting/restoring voter voter settings as needed.
 */
export function VoterSettingsManager(): JSX.Element | null {
  const voterSettingsManager = React.useContext(VoterSettingsManagerContext);
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
        voterSettingsManager.resetThemes();
      }

      // Reset to previous voter settings when election official logs out:
      if (newStatus === 'logged_out' && voterSessionTheme) {
        voterSettingsManager.setColorMode(voterSessionTheme.colorMode);
        voterSettingsManager.setSizeMode(voterSessionTheme.sizeMode);
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
        voterSettingsManager.resetThemes();
      }
    },
  });

  return null;
}
