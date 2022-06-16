import React from 'react';
import { Prose } from '@votingworks/ui';

import { NavigationScreen } from '../components/navigation_screen';

export function BackupsScreen(): JSX.Element {
  return (
    <NavigationScreen>
      <Prose maxWidth={false}>
        <h1>Backups</h1>
      </Prose>
    </NavigationScreen>
  );
}
