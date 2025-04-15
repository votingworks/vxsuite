import { assert, assertDefined } from '@votingworks/basics';
import { SmartCardsScreen as SmartCardsScreenComponent } from '@votingworks/ui';

import { isSystemAdministratorAuth } from '@votingworks/utils';
import { useContext } from 'react';
import { NavigationScreen } from '../components/navigation_screen';
import { getSystemSettings, getAuthStatus, useApiClient } from '../api';
import { AppContext } from '../contexts/app_context';

export function SmartCardsScreen(): JSX.Element | null {
  const authQuery = getAuthStatus.useQuery();
  const systemSettingsQuery = getSystemSettings.useQuery();
  const apiClient = useApiClient();
  const { electionDefinition } = useContext(AppContext);

  if (!(authQuery.isSuccess && systemSettingsQuery.isSuccess)) {
    return null;
  }

  const auth = authQuery.data;
  assert(isSystemAdministratorAuth(auth));

  return (
    <NavigationScreen title="Smart Cards" noPadding>
      <div style={{ display: 'flex', height: '100%' }}>
        <SmartCardsScreenComponent
          auth={auth}
          arePollWorkerCardPinsEnabled={
            systemSettingsQuery.data.auth.arePollWorkerCardPinsEnabled
          }
          election={assertDefined(electionDefinition).election}
          apiClient={apiClient}
        />
      </div>
    </NavigationScreen>
  );
}
