import React from 'react';

import { Button, ButtonProps } from '@votingworks/ui';

export function SettingsButton({ large, onPress }: ButtonProps): JSX.Element {
  return (
    <Button large={large} onPress={onPress} aria-label="Change Settings">
      Settings
    </Button>
  );
}
