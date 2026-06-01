import React from 'react';
import { SizeMode, TouchSizeMode } from '@votingworks/types';
import { ThemeConsumer } from 'styled-components';
import { SettingsPane } from './settings_pane';
import { RadioGroup } from '../radio_group';
import { VoterSettingsManagerContext } from '../voter_settings_manager_context';
import { ThemeLabel } from './theme_label';
import { useScreenInfo } from '../hooks/use_screen_info';
import { appStrings } from '../ui_strings';

export interface SizeSettingsProps {
  /** @default ['touchSmall', 'touchMedium', 'touchLarge', 'touchExtraLarge'] */
  sizeModes?: TouchSizeMode[];
}

const DEFAULT_SIZE_MODES: SizeMode[] = [
  'touchSmall',
  'touchMedium',
  'touchLarge',
  'touchExtraLarge',
];

const ORDERED_SIZE_MODE_LABELS: Record<TouchSizeMode, JSX.Element> = {
  touchSmall: appStrings.labelThemesSizeSmall(),
  touchMedium: appStrings.labelThemesSizeMedium(),
  touchLarge: appStrings.labelThemesSizeLarge(),
  touchExtraLarge: appStrings.labelThemesSizeExtraLarge(),
};

export function SizeSettings(props: SizeSettingsProps): JSX.Element {
  const { sizeModes = DEFAULT_SIZE_MODES } = props;
  const enabledSizeModes = new Set(sizeModes);

  const screenInfo = useScreenInfo();

  const { setSizeMode } = React.useContext(VoterSettingsManagerContext);

  const orderedSizeModes = (
    Object.keys(ORDERED_SIZE_MODE_LABELS) as TouchSizeMode[]
  ).filter((m) => enabledSizeModes.has(m));

  /* istanbul ignore next */
  const numColumns = screenInfo.isPortrait ? 1 : 2;

  return (
    <ThemeConsumer>
      {(currentTheme) => (
        <SettingsPane id="voterSettingsSize">
          <RadioGroup
            hideLabel
            label="Text Size Settings"
            numColumns={numColumns}
            onChange={setSizeMode}
            options={orderedSizeModes.map((m) => ({
              value: m,
              label: (
                <ThemeLabel sizeMode={m}>
                  {ORDERED_SIZE_MODE_LABELS[m]}
                </ThemeLabel>
              ),
            }))}
            value={currentTheme.sizeMode}
          />
        </SettingsPane>
      )}
    </ThemeConsumer>
  );
}
