import React from 'react';
import { ThemeManagerContext, useQueryChangeListener } from '@votingworks/ui';
import { DefaultTheme, ThemeContext } from 'styled-components';
import { getAuthStatus, getScannerStatus } from '../api';

/**
 * Side-effect component for monitoring for auth and voter session changes and
 * resetting/restoring voter display settings as needed.
 */
export function DisplaySettingsManager(): JSX.Element | null {
  const themeManager = React.useContext(ThemeManagerContext);
  const currentTheme = React.useContext(ThemeContext);

  const authStatusQuery = getAuthStatus.useQuery();
  const scannerStatusQuery = getScannerStatus.useQuery();

  const [voterSessionTheme, setVoterSessionTheme] =
    React.useState<DefaultTheme | null>(null);

  useQueryChangeListener(authStatusQuery, (newStatus, previousStatus) => {
    // Reset to default theme when election official logs in:
    if (
      previousStatus?.status === 'logged_out' &&
      newStatus.status !== 'logged_out'
    ) {
      setVoterSessionTheme(currentTheme);
      themeManager.resetThemes();
    }

    // Reset to previous voter settings when election official logs out:
    if (
      previousStatus?.status !== 'logged_out' &&
      newStatus.status === 'logged_out' &&
      voterSessionTheme
    ) {
      themeManager.setColorMode(voterSessionTheme.colorMode);
      themeManager.setSizeMode(voterSessionTheme.sizeMode);
      setVoterSessionTheme(null);
    }
  });

  // [VVSG 2.0 7.1-A] Reset to default theme when voter is done scanning:
  useQueryChangeListener(scannerStatusQuery, (newStatus, previousStatus) => {
    if (
      previousStatus?.state === 'accepted' &&
      newStatus.state === 'no_paper'
    ) {
      themeManager.resetThemes();
    }
  });

  return null;
}
