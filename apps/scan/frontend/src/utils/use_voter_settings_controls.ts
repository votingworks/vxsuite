import React from 'react';
import {
  VoterSettingsManagerContext,
  useCurrentLanguage,
  useLanguageControls,
  useQueryChangeListener,
} from '@votingworks/ui';
import { DefaultTheme, ThemeContext } from 'styled-components';
import { LanguageCode } from '@votingworks/types';
import { getAuthStatus, getScannerStatus } from '../api';

interface VoterSettingsControls {
  resetVoterSettings: () => void;
}

/**
 * useVoterSettingsControls adds Scan-specific settings to the base settings provided by VoterSettingsManagerContext
 */
export function useVoterSettingsControls(): VoterSettingsControls {
  const languageContext = useLanguageControls();
  const voterSettingsContext = React.useContext(VoterSettingsManagerContext);
  const currentLanguage = useCurrentLanguage();
  const currentTheme = React.useContext(ThemeContext);

  // Queries for listeners
  const authStatusQuery = getAuthStatus.useQuery();
  const scannerStatusQuery = getScannerStatus.useQuery();

  // Voter session specific settings, saved to return to after auth-ed sessions
  const [voterSessionTheme, setVoterSessionTheme] =
    React.useState<DefaultTheme | null>(null);
  const [voterSessionLanguage, setVoterSessionLanguage] =
    React.useState<LanguageCode | null>(null);

  function resetVoterSettings() {
    languageContext.reset();
    voterSettingsContext.resetThemes();
    setVoterSessionLanguage(null);
    setVoterSessionTheme(null);
  }

  useQueryChangeListener(authStatusQuery, {
    select: ({ status }) => status,
    onChange: (newStatus, previousStatus) => {
      // Reset to default theme when election official logs in:
      if (previousStatus === 'logged_out') {
        setVoterSessionTheme(currentTheme);
        setVoterSessionLanguage(currentLanguage);
        voterSettingsContext.resetThemes();
        languageContext.reset();
      }

      // Reset to previous voter settings when election official logs out:
      if (newStatus === 'logged_out' && voterSessionTheme) {
        voterSettingsContext.setColorMode(voterSessionTheme.colorMode);
        voterSettingsContext.setSizeMode(voterSessionTheme.sizeMode);
        if (voterSessionLanguage) {
          setVoterSessionLanguage(voterSessionLanguage);
        }
        setVoterSessionTheme(null);
        setVoterSessionLanguage(null);
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
        resetVoterSettings();
      }
    },
  });

  return { resetVoterSettings };
}
