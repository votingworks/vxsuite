import React from 'react';
import styled, { ThemeConsumer } from 'styled-components';

import { SizeMode } from '@votingworks/types';
import { SegmentedButton, SegmentedButtonOption } from './segmented_button';
import { UiThemeManagerContext } from './app_base';
import { Caption } from './typography';

export interface TextSizeSelectorProps {
  devOnlyShowLegacyOption?: boolean;
}

const options: Array<SegmentedButtonOption<SizeMode>> = [
  {
    id: 's',
    label: 'S',
    ariaLabel: 'Small',
  },
  {
    id: 'm',
    label: 'M',
    ariaLabel: 'Medium',
  },
  {
    id: 'l',
    label: 'L',
    ariaLabel: 'Large',
  },
  {
    id: 'xl',
    label: 'XL',
    ariaLabel: 'Extra Large',
  },
];

export function TextSizeSelector(props: TextSizeSelectorProps): JSX.Element {
  const { devOnlyShowLegacyOption } = props;
  const {setSizeMode} = React.useContext(UiThemeManagerContext);

  const visibleOptions: typeof options = devOnlyShowLegacyOption
    ? [
        {
          id: 'legacy',
          label: '↩️',
          ariaLabel: 'Legacy',
        },
        ...options,
      ]
    : options;

  return (
    <ThemeConsumer>
      {(currentTheme) => (
        <div>
          <Caption align="center" aria-hidden>
            Text Size
          </Caption>
          <div>
            <SegmentedButton
              onChange={setSizeMode}
              options={visibleOptions}
              selectedOptionId={currentTheme.sizeMode}
            />
          </div>
        </div>
      )}
    </ThemeConsumer>
  );
}
