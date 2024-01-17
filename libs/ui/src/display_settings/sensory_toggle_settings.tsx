import { ThemeConsumer } from 'styled-components';
import React from 'react';
import { SettingsPane } from './settings_pane';
import { Button } from '../button';
import { DisplaySettingsManagerContext } from '../display_settings_manager_context';
import { appStrings } from '../ui_strings';

export interface SensoryToggleSettingsProps {}

export function SensoryToggleSettings(): JSX.Element {
  const displaySettingsManager = React.useContext(
    DisplaySettingsManagerContext
  );
  return (
    <ThemeConsumer>
      {(theme) => (
        <SettingsPane id="displaySettingsSensoryToggle">
          <Button
            onPress={() => {
              displaySettingsManager.setIsVisualModeDisabled(
                !theme.isVisualModeDisabled
              );
            }}
          >
            {theme.isVisualModeDisabled
              ? appStrings.titleExitAudioOnlyMode()
              : appStrings.titleEnableAudioOnlyMode()}
          </Button>
        </SettingsPane>
      )}
    </ThemeConsumer>
  );
}
