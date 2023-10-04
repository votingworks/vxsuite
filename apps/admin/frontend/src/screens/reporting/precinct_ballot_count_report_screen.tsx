import { Icons, LinkButton, P } from '@votingworks/ui';
import { useContext } from 'react';
import { assert } from '@votingworks/basics';
import { isElectionManagerAuth } from '@votingworks/utils';
import { AppContext } from '../../contexts/app_context';
import { NavigationScreen } from '../../components/navigation_screen';
import { routerPaths } from '../../router_paths';
import { BallotCountReportViewer } from '../../components/reporting/ballot_count_report_viewer';

export const SCREEN_TITLE = 'Precinct Ballot Count Report';

export function PrecinctBallotCountReport(): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for viewing reports.

  return (
    <NavigationScreen title={SCREEN_TITLE}>
      <P>
        <LinkButton small to={routerPaths.reports}>
          <Icons.Previous /> Back
        </LinkButton>
      </P>
      <BallotCountReportViewer
        filter={{}}
        groupBy={{
          groupByPrecinct: true,
          groupByParty: electionDefinition.election.type === 'primary',
        }}
        ballotCountBreakdown="all"
        disabled={false}
        autoPreview
      />
    </NavigationScreen>
  );
}
