import React from 'react';
import styled from 'styled-components';
import { LinkButton, Prose } from '@votingworks/ui';

import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';

const Body = styled(Prose)`
  flex-grow: 1;
`;

const SuperAdminCardsLinkButton = styled(LinkButton)`
  align-self: start;
`;

export function ElectionSmartcardsScreen(): JSX.Element {
  return (
    <NavigationScreen flexRow>
      <Body maxWidth={false}>
        <h1>Smartcards</h1>
        <p>
          Insert a card to view card details or to create an{' '}
          <strong>Admin or Poll Worker</strong> card for this election.
        </p>
      </Body>
      <SuperAdminCardsLinkButton small to={routerPaths.superAdminSmartcards}>
        Create Super Admin Cards
      </SuperAdminCardsLinkButton>
    </NavigationScreen>
  );
}
