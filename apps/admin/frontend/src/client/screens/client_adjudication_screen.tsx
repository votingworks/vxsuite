import { useHistory } from 'react-router-dom';
import { Button, P } from '@votingworks/ui';
import { NavigationScreen } from '../../components/navigation_screen.js';
import { getAdjudicationSessionStatus } from '../api.js';
import { routerPaths } from '../../router_paths.js';

export function ClientAdjudicationScreen(): JSX.Element {
  const history = useHistory();
  const adjudicationStatusQuery = getAdjudicationSessionStatus.useQuery();

  const isAdjudicationEnabled =
    adjudicationStatusQuery.isSuccess &&
    adjudicationStatusQuery.data.isClientAdjudicationEnabled;

  return (
    <NavigationScreen title="Adjudication">
      <P>
        <Button
          disabled={!isAdjudicationEnabled}
          onPress={() => history.push(routerPaths.ballotAdjudication)}
          variant="primary"
        >
          Start Adjudication
        </Button>
      </P>
      {!isAdjudicationEnabled && (
        <P>Waiting for host to initiate adjudication.</P>
      )}
    </NavigationScreen>
  );
}
