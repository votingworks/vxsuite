import React from 'react';
import { Prose } from '@votingworks/ui';

import { NavigationScreen } from '../components/navigation_screen';

export function LogsScreen(): JSX.Element {
  return (
    <NavigationScreen>
      <Prose maxWidth={false}>
        <h1>Logs</h1>
      </Prose>
    </NavigationScreen>
  );
}
