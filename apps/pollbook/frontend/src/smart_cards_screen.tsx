import { SmartCardsScreen as SmartCardsScreenComponent } from '@votingworks/ui';
import { isSystemAdministratorAuth } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { SystemAdministratorNavScreen } from './nav_screen';
import { getAuthStatus, getElection, useApiClient } from './api';

export function SmartCardsScreen(): JSX.Element | null {
  const authQuery = getAuthStatus.useQuery();
  const getElectionQuery = getElection.useQuery();
  const apiClient = useApiClient();

  if (!(authQuery.isSuccess && getElectionQuery.isSuccess)) {
    return null;
  }

  const authStatus = authQuery.data;
  assert(isSystemAdministratorAuth(authStatus));

  let election;
  if (getElectionQuery.data.isOk()) {
    election = getElectionQuery.data.ok();
  }

  return (
    <SystemAdministratorNavScreen title="Smart Cards">
      <div style={{ display: 'flex', height: '100%' }}>
        <SmartCardsScreenComponent
          auth={authStatus}
          election={election}
          apiClient={apiClient}
          arePollWorkerCardPinsEnabled={false}
        />
      </div>
    </SystemAdministratorNavScreen>
  );
}
