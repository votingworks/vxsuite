import React from 'react';
import { Caption, H4, Icons, LinkButton, P } from '@votingworks/ui';

import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';
import { FullTestDeckTallyReportButton } from '../components/full_test_deck_tally_report_button';
import { getCastVoteRecordFileMode } from '../api';
import { Loading } from '../components/loading';

export function LogicAndAccuracyScreen(): JSX.Element {
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();

  function renderScreen(content?: React.ReactNode) {
    return (
      <NavigationScreen title="L&A Testing Documents">
        {content}
      </NavigationScreen>
    );
  }

  if (!castVoteRecordFileModeQuery.isSuccess) {
    return renderScreen(<Loading />);
  }

  if (castVoteRecordFileModeQuery.data === 'official') {
    return renderScreen(
      <P>
        L&A testing documents are not available after official election CVRs
        have been loaded.
      </P>
    );
  }

  return renderScreen(
    <React.Fragment>
      <P>
        Print the following reports and ballot packages in preparation for L&A
        testing.
      </P>
      <ol>
        <H4 as="h2">
          <li>Unofficial Full Election Tally Report</li>
        </H4>
        <P>
          Print the Full Election Tally Report to document that no votes have
          been tallied before L&A testing begins.
        </P>
        <P>
          <Caption>
            <Icons.Info /> Go to the Reports tab and select the “Unofficial Full
            Election Tally Report” button at the top of the page to print the
            report.
          </Caption>
        </P>
        <H4 as="h2">
          <li>Precinct L&A Packages</li>
        </H4>
        <P>
          Each Precinct L&A Package contains marked test ballots, unmarked test
          ballots, and a tally report with expected results.
        </P>
        <P>
          <LinkButton to={routerPaths.testDecks}>
            List Precinct L&A Packages
          </LinkButton>
        </P>
        <H4 as="h2">
          <li>Test Deck Tally Report for All Precincts</li>
        </H4>
        <P>
          This report has the results that are expected after scanning all the
          test ballots.
        </P>
        <P>
          <FullTestDeckTallyReportButton />
        </P>
      </ol>
    </React.Fragment>
  );
}
