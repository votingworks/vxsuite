import { useContext } from 'react';
import { isElectionManagerAuth } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { P } from '@votingworks/ui';

import { AppContext } from '../../contexts/app_context';

import { NavigationScreen } from '../../components/navigation_screen';

import { TallyReportViewer } from '../../components/reporting/tally_report_viewer';
import { ReportBackButton } from '../../components/reporting/shared';

const SCREEN_TITLE = 'Full Election Tally Report';

export function FullElectionTallyReportScreen(): JSX.Element {
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
        groupBy={{}}
        disabled={false}
        autoGenerateReport
      />
    </NavigationScreen>
  );
}
