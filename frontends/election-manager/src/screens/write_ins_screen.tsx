import React from 'react';

import { NavigationScreen } from '../components/navigation_screen';
import { Prose } from '../components/prose';

export function WriteInsScreen(): JSX.Element {
  return (
    <React.Fragment>
      <NavigationScreen mainChildFlex>
        <Prose maxWidth={false}>
          <h1>Write-Ins</h1>
        </Prose>
      </NavigationScreen>
    </React.Fragment>
  );
}
