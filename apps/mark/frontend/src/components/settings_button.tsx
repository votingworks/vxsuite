import React from 'react';

import { Button } from '@votingworks/ui';

interface SettingsButtonProps {
  large?: boolean;
  onPress: () => void;
}

export function SettingsButton({
  large,
  onPress,
}: SettingsButtonProps): JSX.Element {
  return (
    <Button large={large} onPress={onPress} aria-label="Change Settings">
      Settings
    </Button>
  );
}
