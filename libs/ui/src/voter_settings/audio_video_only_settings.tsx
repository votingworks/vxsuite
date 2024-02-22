import { ThemeConsumer } from 'styled-components';
import React from 'react';
import { SettingsPane } from './settings_pane';
import { Button } from '../button';
import { VoterSettingsManagerContext } from '../voter_settings_manager_context';
import { appStrings } from '../ui_strings';

export function AudioVideoOnlySettings(): JSX.Element {
  const voterSettingsManager = React.useContext(VoterSettingsManagerContext);
  return (
    <ThemeConsumer>
      {(theme) => (
        <SettingsPane id="voterSettingsAudioVideoOnly">
          <Button
            onPress={() => {
              voterSettingsManager.setIsVisualModeDisabled(
                !theme.isVisualModeDisabled
              );
            }}
          >
            {theme.isVisualModeDisabled
              ? appStrings.buttonExitAudioOnlyMode()
              : appStrings.buttonEnableAudioOnlyMode()}
          </Button>
        </SettingsPane>
      )}
    </ThemeConsumer>
  );
}
