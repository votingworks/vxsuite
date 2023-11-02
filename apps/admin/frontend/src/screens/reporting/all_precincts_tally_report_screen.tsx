import { P } from '@votingworks/ui';
import { useContext } from 'react';
import { assert } from '@votingworks/basics';
import { isElectionManagerAuth } from '@votingworks/utils';
import { AppContext } from '../../contexts/app_context';
import { NavigationScreen } from '../../components/navigation_screen';
import { TallyReportViewer } from '../../components/reporting/tally_report_viewer';
import { ReportBackButton } from '../../components/reporting/shared';

export const SCREEN_TITLE = 'All Precincts Tally Report';

export function AllPrecinctsTallyReportScreen(): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth));

  return (
    <NavigationScreen title={SCREEN_TITLE}>
      <P>
        <ReportBackButton />
      </P>
      <TallyReportViewer
        filter={{}}
        groupBy={{ groupByPrecinct: true }}
        disabled={false}
        autoGenerateReport
      />
    </NavigationScreen>
  );
}
