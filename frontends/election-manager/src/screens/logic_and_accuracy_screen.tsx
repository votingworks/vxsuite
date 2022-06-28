import React, { useContext } from 'react';
import { LinkButton, Prose } from '@votingworks/ui';

import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';
import { FullTestDeckTallyReportButton } from '../components/full_test_deck_tally_report_button';
import { AppContext } from '../contexts/app_context';

export function LogicAndAccuracyScreen(): JSX.Element {
  const { castVoteRecordFiles } = useContext(AppContext);
  const isLiveMode =
    castVoteRecordFiles.filter((c) => !c.isTestMode).length > 0;

  return (
    <NavigationScreen>
      <Prose maxWidth={false}>
        <h1>L&amp;A Materials</h1>
        {isLiveMode ? (
          <p>
            L&amp;A materials are not available after live CVRs have been
            imported.
          </p>
        ) : (
          <React.Fragment>
            <p>
              Go to the “Tally” tab and print the “Unofficial Full Election
              Tally Report”. This report is referred to as the “Zero Report”
              because — before CVRs have been imported — all tallies should be
              zero.
            </p>
            <p>
              <LinkButton to={routerPaths.testDecks}>
                Print L&amp;A Packages
              </LinkButton>
            </p>
            <p>
              <FullTestDeckTallyReportButton />
            </p>
          </React.Fragment>
        )}
      </Prose>
    </NavigationScreen>
  );
}
