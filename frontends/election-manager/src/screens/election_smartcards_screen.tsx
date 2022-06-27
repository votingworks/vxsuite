import React from 'react';
import { LinkButton, Prose } from '@votingworks/ui';

import { CardProgrammingPrompt } from '../components/card_programming_prompt';
import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';

export function ElectionSmartcardsScreen(): JSX.Element {
  return (
    <NavigationScreen>
      <Prose maxWidth={false}>
        <h1>Smartcards</h1>
        <CardProgrammingPrompt cardType="election" />
        <p>
          <LinkButton small to={routerPaths.superAdminSmartcards}>
            Create Super Admin Cards Instead
          </LinkButton>
        </p>
      </Prose>
    </NavigationScreen>
  );
}
