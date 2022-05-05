import React from 'react';
import { LinkButton, Prose } from '@votingworks/ui';

import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';
import { ZeroReportPrintButton } from '../components/zero_report_print_button';

export function LogicAndAccuracyScreen(): JSX.Element {
  return (
    <NavigationScreen>
      <Prose maxWidth={false}>
        <h1>L&amp;A Materials</h1>
        <ZeroReportPrintButton />
        <p>
          <LinkButton to={routerPaths.testDecks}>Print Test Decks</LinkButton>
        </p>
        <p>
          <LinkButton to={routerPaths.testDeckTallyReports}>
            Print Test Deck Tally Reports
          </LinkButton>
        </p>
      </Prose>
    </NavigationScreen>
  );
}
