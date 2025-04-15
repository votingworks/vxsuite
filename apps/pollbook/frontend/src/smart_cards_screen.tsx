import { SmartCardsScreen as SmartCardsScreenComponent } from '@votingworks/ui';
import { SystemAdministratorNavScreen } from './nav_screen';
import { getAuthStatus, getElection, useApiClient } from './api';

export function SmartCardsScreen(): JSX.Element | null {
  const authQuery = getAuthStatus.useQuery();
  const getElectionQuery = getElection.useQuery();
  const apiClient = useApiClient();

  if (!(authQuery.isSuccess && getElectionQuery.isSuccess)) {
    return null;
  }

  const auth = authQuery.data;
  const election = getElectionQuery.data.unsafeUnwrap();

  return (
    <SystemAdministratorNavScreen title="Smart Cards">
      <div style={{ display: 'flex', height: '100%' }}>
        <SmartCardsScreenComponent
          auth={auth}
          election={election}
          apiClient={apiClient}
          arePollWorkerCardPinsEnabled={false}
        />
      </div>
    </SystemAdministratorNavScreen>
  );
}
