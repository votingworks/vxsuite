import React from 'react';
import styled from 'styled-components';
import { LinkButton, Prose } from '@votingworks/ui';

import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';

const Body = styled(Prose)`
  flex-grow: 1;
`;

const ElectionCardsLinkButton = styled(LinkButton)`
  align-self: start;
`;

export function SuperAdminSmartcardsScreen(): JSX.Element {
  return (
    <NavigationScreen flexRow>
      <Body maxWidth={false}>
        <h1>Smartcards</h1>
        <p>
          Insert a card to view card details or to create a{' '}
          <strong>Super Admin</strong> card.
        </p>
      </Body>
      <ElectionCardsLinkButton small to={routerPaths.electionSmartcards}>
        Create Election Cards
      </ElectionCardsLinkButton>
    </NavigationScreen>
  );
}
