import React from 'react';
import { Prose } from '@votingworks/ui';

import { NavigationScreen } from '../components/navigation_screen';

export function SettingsScreen(): JSX.Element {
  return (
    <NavigationScreen>
      <Prose maxWidth={false}>
        <h1>Settings</h1>
      </Prose>
    </NavigationScreen>
  );
}
