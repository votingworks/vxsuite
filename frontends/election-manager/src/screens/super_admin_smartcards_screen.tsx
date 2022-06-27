import React from 'react';
import { LinkButton, Prose } from '@votingworks/ui';

import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';

export function SuperAdminSmartcardsScreen(): JSX.Element {
  return (
    <NavigationScreen>
      <Prose maxWidth={false}>
        <h1>Smartcards</h1>
        <h2>Super Admin Cards</h2>
        <p>
          Insert a card to view card details and/or to create a{' '}
          <strong>Super Admin</strong> card.
        </p>
        <p>
          <LinkButton small to={routerPaths.electionSmartcards}>
            Back to Election Cards
          </LinkButton>
        </p>
      </Prose>
    </NavigationScreen>
  );
}
