import { useContext } from 'react';
import { isElectionManagerAuth } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { AppContext } from '../../contexts/app_context';
import { NavigationScreen } from '../../components/navigation_screen';
import { TallyReportViewer } from '../../components/reporting/tally_report_viewer';
import {
  reportParentRoutes,
  ReportScreenContainer,
} from '../../components/reporting/shared';

export const TITLE = 'Full Election Tally Report';

export function FullElectionTallyReportScreen(): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth));

  return (
    <NavigationScreen title={TITLE} parentRoutes={reportParentRoutes} noPadding>
      <ReportScreenContainer>
        <TallyReportViewer
          filter={{}}
          groupBy={{}}
          disabled={false}
          autoGenerateReport
        />
      </ReportScreenContainer>
    </NavigationScreen>
  );
}
