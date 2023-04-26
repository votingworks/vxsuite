import React from 'react';
import { Prose } from '@votingworks/ui';

import { NavigationScreen } from '../components/navigation_screen';

export function LogicAndAccuracyScreen(): JSX.Element {
  return (
    <NavigationScreen>
      <Prose>
        <h1>L&A Testing Documents</h1>
        <p>
          VxAdmin does not produce ballots or L&A documents for this election.
        </p>
      </Prose>
    </NavigationScreen>
  );
}
