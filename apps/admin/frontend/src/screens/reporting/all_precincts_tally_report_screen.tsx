import { Icons, LinkButton, P } from '@votingworks/ui';
import { useContext } from 'react';
import { assert } from '@votingworks/basics';
import { isElectionManagerAuth } from '@votingworks/utils';
import { AppContext } from '../../contexts/app_context';
import { NavigationScreen } from '../../components/navigation_screen';
import { routerPaths } from '../../router_paths';
import { TallyReportViewer } from '../../components/reporting/tally_report_viewer';

export const SCREEN_TITLE = 'All Precincts Tally Report';

export function AllPrecinctsTallyReportScreen(): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for viewing tally reports.

  return (
    <NavigationScreen title={SCREEN_TITLE}>
      <P>
        <LinkButton small to={routerPaths.reports}>
          <Icons.Previous /> Back
        </LinkButton>
      </P>
      <TallyReportViewer
        filter={{}}
        groupBy={{ groupByPrecinct: true }}
        disabled={false}
        autoPreview
      />
    </NavigationScreen>
  );
}
