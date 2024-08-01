import React from 'react';
import { DefaultTheme } from 'styled-components';

import {
  VoterSettingsManagerContext,
  useAudioControls,
  useAudioEnabled,
  useCurrentLanguage,
  useCurrentTheme,
  useLanguageControls,
} from '@votingworks/ui';
import { InsertedSmartCardAuth, LanguageCode } from '@votingworks/types';
import { isCardlessVoterAuth } from '@votingworks/utils';

export interface UseSessionSettingsManagerParams {
  authStatus: InsertedSmartCardAuth.AuthStatus;
}

export interface UseSessionSettingsManagerResult {
  onSessionEnd: () => void;
}

interface VoterSettings {
  isAudioEnabled: boolean;
  language: LanguageCode;
  theme: DefaultTheme;
}

export function useSessionSettingsManager(
  params: UseSessionSettingsManagerParams
): UseSessionSettingsManagerResult {
  const { authStatus } = params;

  const [voterSettings, saveVoterSettings] = React.useState<VoterSettings>();

  const voterSettingsManager = React.useContext(VoterSettingsManagerContext);
  const currentTheme = useCurrentTheme();

  const { setIsEnabled: setAudioEnabled } = useAudioControls();
  const { reset: resetLanguage, setLanguage } = useLanguageControls();
  const currentLanguage = useCurrentLanguage();
  const isAudioEnabled = useAudioEnabled();

  const isLoggedInAsVoter = isCardlessVoterAuth(authStatus);

  //
  // Wrap `isLoggedInAsVoter` in a ref for effects that don't need to re-run
  // when it changes:
  //
  const isLoggedInAsVoterRef = React.useRef(isLoggedInAsVoter);
  isLoggedInAsVoterRef.current = isLoggedInAsVoter;

  //
  // Save voter settings whenever they are changed during a voter session:
  //
  React.useEffect(() => {
    if (!isLoggedInAsVoterRef.current) {
      return;
    }

    saveVoterSettings({
      isAudioEnabled,
      language: currentLanguage,
      theme: currentTheme,
    });
  }, [currentLanguage, currentTheme, isAudioEnabled]);

  /**
   * Callback for updating settings to match previously saved voter settings:
   */
  const restoreVoterSettings = React.useCallback(() => {
    if (!voterSettings) {
      return;
    }

    voterSettingsManager.setColorMode(voterSettings.theme.colorMode);
    voterSettingsManager.setSizeMode(voterSettings.theme.sizeMode);
    voterSettingsManager.setIsVisualModeDisabled(
      voterSettings.theme.isVisualModeDisabled
    );
    setLanguage(voterSettings.language);
    setAudioEnabled(voterSettings.isAudioEnabled);
  }, [setAudioEnabled, setLanguage, voterSettings, voterSettingsManager]);

  /**
   * Callback for resetting to setting defaults for non-voters:
   */
  const resetSettingsForNonVoter = React.useCallback(() => {
    voterSettingsManager.resetThemes();
    resetLanguage();
    setAudioEnabled(false);
  }, [resetLanguage, setAudioEnabled, voterSettingsManager]);

  //
  // Wrap the settings management callbacks in refs to enable usage in the
  // effect below without creating explicit dependencies and triggering the
  // effect every time the callbacks are recomputed:
  //

  const restoreSettingsFnRef = React.useRef(restoreVoterSettings);
  restoreSettingsFnRef.current = restoreVoterSettings;

  const resetForNonVoterFnRef = React.useRef(resetSettingsForNonVoter);
  resetForNonVoterFnRef.current = resetSettingsForNonVoter;

  //
  // When auth state changes, either reset to default settings for non-voters,
  // or restore previous voter settings for voter auth.
  //
  React.useEffect(() => {
    if (isLoggedInAsVoter) {
      restoreSettingsFnRef.current();
    } else {
      resetForNonVoterFnRef.current();
    }
  }, [isLoggedInAsVoter]);

  //
  // Return a callback for client apps to trigger when ending a voter session,
  // which will clear the saved voter settings:
  //

  const onSessionEnd = React.useCallback(() => {
    saveVoterSettings(undefined);
  }, []);

  return { onSessionEnd };
}
