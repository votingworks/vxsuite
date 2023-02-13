import React from 'react';
import styled from 'styled-components';

import { Button, SegmentedButton } from '@votingworks/shared-frontend';

import {
  EventTargetFunction,
  SetUserSettings,
  TextSizeSetting,
  UserSettings,
} from '../config/types';
import { FONT_SIZES } from '../config/globals';

const TextSizeSegmentedButton = styled(SegmentedButton)`
  button {
    min-width: ${FONT_SIZES[1] * 3.5}px;
    /* stylelint-disable declaration-no-important */
    &[data-size='0'] {
      font-size: ${FONT_SIZES[0]}px !important;
    }
    &[data-size='1'] {
      font-size: ${FONT_SIZES[1]}px !important;
    }
    &[data-size='2'] {
      font-size: ${FONT_SIZES[2]}px !important;
    }
    /* stylelint-enable */
  }
`;

const Label = styled.label`
  display: block;
  margin-bottom: 0.4rem;
`;

interface Props {
  userSettings: UserSettings;
  setUserSettings: SetUserSettings;
}

const ariaLabels = ['Small', 'Medium', 'Large', 'Extra Large'];

export function SettingsTextSize({
  userSettings,
  setUserSettings,
}: Props): JSX.Element {
  const adjustFontSize: EventTargetFunction = (event) => {
    const target = event.currentTarget as HTMLButtonElement;
    // eslint-disable-next-line vx/gts-safe-number-parse
    const textSize = +target.value as TextSizeSetting;
    setUserSettings({ textSize });
  };
  return (
    <p>
      <Label aria-hidden>Text Size</Label>
      <TextSizeSegmentedButton data-testid="change-text-size-buttons">
        {FONT_SIZES.slice(0, 3).map((v: number, i: number) => (
          <Button
            key={v}
            data-size={i}
            small
            onPress={adjustFontSize}
            value={i}
            primary={userSettings.textSize === i}
            aria-label={`${
              userSettings.textSize === i ? 'Selected' : ''
            } Text Size: ${ariaLabels[i]}`}
          >
            A
          </Button>
        ))}
      </TextSizeSegmentedButton>
    </p>
  );
}
