import React from 'react';
import { TouchColorMode } from '@votingworks/types';
import { ThemeConsumer } from 'styled-components';
import { SettingsPane } from './settings_pane';
import { RadioGroup } from '../radio_group';
import { VoterSettingsManagerContext } from '../voter_settings_manager_context';
import { ThemeLabel } from './theme_label';
import { useScreenInfo } from '../hooks/use_screen_info';
import { appStrings } from '../ui_strings';

export interface ColorSettingsProps {
  /** @default ['contrastLow', 'contrastMedium', 'contrastHighLight', 'contrastHighDark'] */
  colorModes?: TouchColorMode[];
}

const DEFAULT_COLOR_MODES: TouchColorMode[] = [
  'contrastHighDark',
  'contrastLow',
  'contrastMedium',
  'contrastHighLight',
];

const ORDERED_COLOR_MODE_LABELS: Record<TouchColorMode, JSX.Element> = {
  contrastHighDark: appStrings.labelThemesContrastHighDark(),
  contrastLow: appStrings.labelThemesContrastLow(),
  contrastMedium: appStrings.labelThemesContrastMedium(),
  contrastHighLight: appStrings.labelThemesContrastHighLight(),
};

export function ColorSettings(props: ColorSettingsProps): JSX.Element {
  const { colorModes = DEFAULT_COLOR_MODES } = props;
  const enabledColorModes = new Set(colorModes);

  const screenInfo = useScreenInfo();

  const { setColorMode } = React.useContext(VoterSettingsManagerContext);

  const orderedColorModes = (
    Object.keys(ORDERED_COLOR_MODE_LABELS) as TouchColorMode[]
  ).filter((m) => enabledColorModes.has(m));

  /* istanbul ignore next */
  const numColumns = screenInfo.isPortrait ? 1 : 2;

  return (
    <ThemeConsumer>
      {(currentTheme) => (
        <SettingsPane id="voterSettingsColor">
          <RadioGroup
            hideLabel
            label="Color Contrast Settings"
            numColumns={numColumns}
            onChange={setColorMode}
            options={orderedColorModes.map((mode) => ({
              value: mode,
              label: (
                <ThemeLabel colorMode={mode}>
                  {ORDERED_COLOR_MODE_LABELS[mode]}
                </ThemeLabel>
              ),
            }))}
            value={currentTheme.colorMode}
          />
        </SettingsPane>
      )}
    </ThemeConsumer>
  );
}
