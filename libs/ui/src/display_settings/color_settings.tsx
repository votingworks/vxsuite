import React from 'react';
import { ColorMode } from '@votingworks/types';
import { ThemeConsumer } from 'styled-components';
import { SettingsPane } from './settings_pane';
import { RadioGroup } from '../radio_group';
import { ThemeManagerContext } from '../theme_manager_context';
import { ThemeLabel } from './theme_label';
import { useScreenInfo } from '../hooks/use_screen_info';

export interface ColorSettingsProps {
  /** @default ['contrastLow', 'contrastMedium', 'contrastHighLight', 'contrastHighDark'] */
  colorModes?: ColorMode[];
}

const DEFAULT_COLOR_MODES: ColorMode[] = [
  'contrastHighDark',
  'contrastLow',
  'contrastMedium',
  'contrastHighLight',
];

const ORDERED_COLOR_MODE_LABELS: Record<ColorMode, string> = {
  contrastHighDark: 'White text, black background',
  contrastLow: 'Gray text, dark background',
  contrastMedium: 'Dark text, light background',
  contrastHighLight: 'Black text, white background',
  legacy: 'DEV ONLY: Pre-VVSG styling',
};

export function ColorSettings(props: ColorSettingsProps): JSX.Element {
  const { colorModes = DEFAULT_COLOR_MODES } = props;
  const enabledColorModes = new Set(colorModes);

  const screenInfo = useScreenInfo();

  const { setColorMode } = React.useContext(ThemeManagerContext);

  const orderedColorModes = (
    Object.keys(ORDERED_COLOR_MODE_LABELS) as ColorMode[]
  ).filter((m) => enabledColorModes.has(m));

  /* istanbul ignore next */
  const numColumns = screenInfo.isPortrait ? 1 : 2;

  return (
    <ThemeConsumer>
      {(currentTheme) => (
        <SettingsPane id="displaySettingsColor">
          <RadioGroup
            hideLabel
            label="Color Contrast Settings"
            numColumns={numColumns}
            onChange={setColorMode}
            options={orderedColorModes.map((mode) => ({
              id: mode,
              label: (
                <ThemeLabel colorMode={mode}>
                  {ORDERED_COLOR_MODE_LABELS[mode]}
                </ThemeLabel>
              ),
            }))}
            selectedOptionId={currentTheme.colorMode}
          />
        </SettingsPane>
      )}
    </ThemeConsumer>
  );
}
