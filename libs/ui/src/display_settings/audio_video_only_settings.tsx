import { ThemeConsumer } from 'styled-components';
import React from 'react';
import { SettingsPane } from './settings_pane';
import { Button } from '../button';
import { DisplaySettingsManagerContext } from '../display_settings_manager_context';
import { appStrings } from '../ui_strings';

export function AudioVideoOnlySettings(): JSX.Element {
  const displaySettingsManager = React.useContext(
    DisplaySettingsManagerContext
  );
  return (
    <ThemeConsumer>
      {(theme) => (
        <SettingsPane id="displaySettingsAudioVideoOnly">
          <Button
            onPress={() => {
              displaySettingsManager.setIsVisualModeDisabled(
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
