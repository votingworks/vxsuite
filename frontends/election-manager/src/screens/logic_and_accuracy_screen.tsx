import React, { useContext } from 'react';
import { LinkButton, Prose } from '@votingworks/ui';

import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';
import { FullTestDeckTallyReportButton } from '../components/full_test_deck_tally_report_button';
import { AppContext } from '../contexts/app_context';

export function LogicAndAccuracyScreen(): JSX.Element {
  const { castVoteRecordFiles } = useContext(AppContext);
  const isLiveMode = castVoteRecordFiles?.fileMode === 'live';

  return (
    <NavigationScreen>
      <Prose maxWidth={false}>
        <h1>L&A Testing Documents</h1>
        {isLiveMode ? (
          <p>
            L&A testing documents are not available after official election CVRs
            have been imported.
          </p>
        ) : (
          <React.Fragment>
            <p>
              Print the following reports and ballot packages in preparation for
              L&A testing.
            </p>
            <h2>1. Unofficial Full Election Tally Report</h2>
            <p>
              Print the Full Election Tally Report to document that no votes
              have been tallied before L&A testing begins.
            </p>
            <p>
              <em>
                Go to the Reports tab and select the “Unofficial Full Election
                Tally Report” button at the top of the page to print the report.
              </em>
            </p>
            <h2>2. Precinct L&A Packages</h2>
            <p>
              Each Precinct L&A Package contains marked test ballots, unmarked
              test ballots, and a tally report with expected results.
            </p>
            <p>
              <LinkButton to={routerPaths.testDecks}>
                List Precinct L&A Packages
              </LinkButton>
            </p>
            <h2>3. Test Deck Tally Report for All Precincts</h2>
            <p>
              This report has the results that are expected after scanning all
              the test ballots.
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
