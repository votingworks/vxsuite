import { assert, throwIllegalValue } from '@votingworks/basics';
import { CardDetailsAndActions, InsertCardPrompt } from '@votingworks/ui';

import { isSystemAdministratorAuth } from '@votingworks/utils';
import { SystemAdministratorNavScreen } from './nav_screen';
import { getAuthStatus, getElection, useApiClient } from './api';

function SmartCardsScreenContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SystemAdministratorNavScreen title="Smart Cards">
      <div style={{ display: 'flex', height: '100%' }}>{children}</div>
    </SystemAdministratorNavScreen>
  );
}

export function SmartCardsScreen(): JSX.Element | null {
  const authQuery = getAuthStatus.useQuery();
  const getElectionQuery = getElection.useQuery();
  const apiClient = useApiClient();

  if (!(authQuery.isSuccess && getElectionQuery.isSuccess)) {
    return null;
  }

  const auth = authQuery.data;
  assert(isSystemAdministratorAuth(auth));
  const { programmableCard: card } = auth;

  const election = getElectionQuery.data.unsafeUnwrap();

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
            election={election}
            apiClient={apiClient}
            arePollWorkerCardPinsEnabled={false}
          />
        </SmartCardsScreenContainer>
      );

    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(card.status);
    }
  }
}
