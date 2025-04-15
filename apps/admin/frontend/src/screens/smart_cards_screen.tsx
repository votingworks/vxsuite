import { assert, throwIllegalValue } from '@votingworks/basics';
import { CardDetailsAndActions, InsertCardPrompt } from '@votingworks/ui';

import { isSystemAdministratorAuth } from '@votingworks/utils';
import { useContext } from 'react';
import { NavigationScreen } from '../components/navigation_screen';
import { getSystemSettings, getAuthStatus, useApiClient } from '../api';
import { AppContext } from '../contexts/app_context';

function SmartCardsScreenContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NavigationScreen title="Smart Cards" noPadding>
      <div style={{ display: 'flex', height: '100%' }}>{children}</div>
    </NavigationScreen>
  );
}

export function SmartCardsScreen(): JSX.Element | null {
  const authQuery = getAuthStatus.useQuery();
  const systemSettingsQuery = getSystemSettings.useQuery();
  const apiClient = useApiClient();
  const { electionDefinition } = useContext(AppContext);

  if (!(authQuery.isSuccess && systemSettingsQuery.isSuccess)) {
    return null;
  }

  assert(electionDefinition);

  const auth = authQuery.data;
  assert(isSystemAdministratorAuth(auth));
  const { programmableCard: card } = auth;

  assert(card.status !== 'no_card_reader' && card.status !== 'unknown_error');
  switch (card.status) {
    case 'no_card':
    case 'card_error':
      return (
        <SmartCardsScreenContainer>
          <InsertCardPrompt cardStatus={card.status} />
        </SmartCardsScreenContainer>
      );
    case 'ready':
      return (
        <SmartCardsScreenContainer>
          <CardDetailsAndActions
            card={card}
            systemSettings={systemSettingsQuery.data}
            electionDefinition={electionDefinition}
            apiClient={apiClient}
          />
        </SmartCardsScreenContainer>
      );

    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(card.status);
    }
  }
}
