import React from 'react';
import { LinkButton, Prose } from '@votingworks/ui';

import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';

export function ElectionSmartcardsScreen(): JSX.Element {
  return (
    <NavigationScreen>
      <Prose maxWidth={false}>
        <h1>Smartcards</h1>
        <h2>Election Cards</h2>
        <p>
          Insert a card to view card details and/or to create an{' '}
          <strong>Admin or Poll Worker</strong> card for this election. The
          election definition must be locked before Admin and Poll Worker cards
          can be created.
        </p>
        <p>
          <LinkButton small to={routerPaths.superAdminSmartcards}>
            Create Super Admin Cards
          </LinkButton>
        </p>
      </Prose>
    </NavigationScreen>
  );
}
