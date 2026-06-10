import { useContext } from 'react';
import { assert } from '@votingworks/basics';
import { isElectionManagerAuth } from '@votingworks/utils';
import { isPrimary } from '@votingworks/types';
import { AppContext } from '../../contexts/app_context';
import { NavigationScreen } from '../../components/navigation_screen';
import { BallotCountReportViewer } from '../../components/reporting/ballot_count_report_viewer';
import {
  reportParentRoutes,
  ReportScreenContainer,
} from '../../components/reporting/shared';

export const TITLE = 'Precinct Ballot Count Report';

export function PrecinctBallotCountReport(): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth));

  return (
    <NavigationScreen title={TITLE} parentRoutes={reportParentRoutes} noPadding>
      <ReportScreenContainer>
        <BallotCountReportViewer
          filter={{}}
          groupBy={{
            groupByPrecinct: true,
            groupByParty: isPrimary(electionDefinition.election),
          }}
          includeSheetCounts={false}
          disabled={false}
          autoGenerateReport
        />
      </ReportScreenContainer>
    </NavigationScreen>
  );
}
