import React from 'react';
import {
  VoterSettingsManagerContext,
  useCurrentLanguage,
  useLanguageControls,
  useQueryChangeListener,
} from '@votingworks/ui';
import { DefaultTheme, ThemeContext } from 'styled-components';
import { LanguageCode } from '@votingworks/types';
import { getAuthStatus, getPollsInfo, getScannerStatus } from '../api';

/**
 * Side-effect component for monitoring for auth and voter session changes and
 * resetting/restoring voter display settings and language choice as needed.
 */
export function VoterSettingsManager(): JSX.Element | null {
  const voterSettingsManager = React.useContext(VoterSettingsManagerContext);
  const currentTheme = React.useContext(ThemeContext);

  const authStatusQuery = getAuthStatus.useQuery();
  const scannerStatusQuery = getScannerStatus.useQuery();
  const pollsInfoQuery = getPollsInfo.useQuery();

  const { reset: resetLanguage, setLanguage } = useLanguageControls();
  const currentLanguage = useCurrentLanguage();

  const [voterSessionTheme, setVoterSessionTheme] =
    React.useState<DefaultTheme | null>(null);

  const [voterLanguage, setVoterLanguage] = React.useState<LanguageCode | null>(
    null
  );

  useQueryChangeListener(pollsInfoQuery, {
    select: ({ pollsState }) => pollsState,
    onChange: (newState) => {
      // Reset to default theme when polls close
      if (newState === 'polls_closed_final') {
        voterSettingsManager.resetThemes();
        resetLanguage();
        setVoterSessionTheme(null);
        setVoterLanguage(null);
      }
    },
  });

  useQueryChangeListener(authStatusQuery, {
    select: ({ status }) => status,
    onChange: (newStatus, previousStatus) => {
      // Reset to default theme when election official logs in:
      if (previousStatus === 'logged_out') {
        setVoterSessionTheme(currentTheme);
        setVoterLanguage(currentLanguage);
        voterSettingsManager.resetThemes();
        resetLanguage();
      }

      // Reset to previous voter settings when election official logs out:
      if (newStatus === 'logged_out' && voterSessionTheme) {
        voterSettingsManager.setColorMode(voterSessionTheme.colorMode);
        voterSettingsManager.setSizeMode(voterSessionTheme.sizeMode);
        if (voterLanguage) {
          setLanguage(voterLanguage);
        }
        setVoterSessionTheme(null);
        setVoterLanguage(null);
      }
    },
  });

  // [VVSG 2.0 7.1-A] Reset to default theme and language when voter is done scanning. We
  // have chosen to interpret that as whenever paper leaves the scanner (either
  // into the ballot box, or retrieved by the user after a ballot rejection).
  useQueryChangeListener(scannerStatusQuery, {
    select: ({ state }) => state,
    onChange: (newState, previousState) => {
      // If we transition from paused to no_paper we are just returning from an election official screen
      if (
        previousState &&
        previousState !== 'no_paper' &&
        previousState !== 'paused' &&
        newState === 'no_paper'
      ) {
        voterSettingsManager.resetThemes();
        resetLanguage();
      }
    },
  });

  return null;
}
