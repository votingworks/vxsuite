import React from 'react';
import { SizeMode } from '@votingworks/types';
import { ThemeConsumer } from 'styled-components';
import { SettingsPane } from './settings_pane';
import { RadioGroup } from '../radio_group';
import { ThemeManagerContext } from '../theme_manager_context';
import { ThemeLabel } from './theme_label';
import { useScreenInfo } from '../hooks/use_screen_info';

export interface SizeSettingsProps {
  /** @default ['s', 'm', 'l', 'xl'] */
  sizeModes?: SizeMode[];
}

const DEFAULT_SIZE_MODES: SizeMode[] = ['s', 'm', 'l', 'xl'];

const ORDERED_SIZE_MODE_LABELS: Record<SizeMode, string> = {
  s: 'Small',
  m: 'Medium',
  l: 'Large',
  xl: 'Extra-Large',
};

export function SizeSettings(props: SizeSettingsProps): JSX.Element {
  const { sizeModes = DEFAULT_SIZE_MODES } = props;
  const enabledSizeModes = new Set(sizeModes);

  const screenInfo = useScreenInfo();

  const { setSizeMode } = React.useContext(ThemeManagerContext);

  const orderedSizeModes = (
    Object.keys(ORDERED_SIZE_MODE_LABELS) as SizeMode[]
  ).filter((m) => enabledSizeModes.has(m));

  /* istanbul ignore next */
  const numColumns = screenInfo.isPortrait ? 1 : 2;

  return (
    <ThemeConsumer>
      {(currentTheme) => (
        <SettingsPane id="displaySettingsSize">
          <RadioGroup
            hideLabel
            label="Text Size Settings"
            numColumns={numColumns}
            onChange={setSizeMode}
            options={orderedSizeModes.map((m) => ({
              id: m,
              label: (
                <ThemeLabel sizeMode={m}>
                  {ORDERED_SIZE_MODE_LABELS[m]}
                </ThemeLabel>
              ),
            }))}
            selectedOptionId={currentTheme.sizeMode}
          />
        </SettingsPane>
      )}
    </ThemeConsumer>
  );
}
