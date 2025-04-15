import styled from 'styled-components';
import { assert, deepEqual, throwIllegalValue } from '@votingworks/basics';
import {
  ActionResultCallout,
  Button,
  Callout,
  CardIllustration,
  ConfirmSystemAdminCardActionModal,
  ElectionInfo,
  H1,
  H2,
  Icons,
  InsertCardPrompt,
  P,
  SmartCardsScreenButtonList,
} from '@votingworks/ui';

import { isSystemAdministratorAuth } from '@votingworks/utils';
import {
  constructElectionKey,
  DippedSmartCardAuth,
  SystemSettings,
  UserWithCard,
} from '@votingworks/types';
import { useContext, useState } from 'react';
import { NavigationScreen } from '../components/navigation_screen';
import { AppContext } from '../contexts/app_context';
import {
  getSystemSettings,
  programCard as apiProgramCard,
  unprogramCard as apiUnprogramCard,
  getAuthStatus,
} from '../api';

type CardRole = UserWithCard['role'];

const prettyRoles: Record<CardRole, string> = {
  vendor: 'Vendor',
  system_administrator: 'System Administrator',
  election_manager: 'Election Manager',
  poll_worker: 'Poll Worker',
};

type SmartCardAction = 'Program' | 'PinReset' | 'Unprogram';

interface SmartCardActionResult {
  status: 'Success' | 'Error';
  action: SmartCardAction;
  role: CardRole;
  newPin?: string;
}

const CardActions = styled.div`
  padding: 1rem;
  display: flex;
  flex-direction: column;
`;

interface ConfirmSystemAdminCardAction {
  actionType: 'Program' | 'PinReset';
  doAction: VoidFunction;
}

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

function CardDetailsAndActions({
  card,
  systemSettings,
}: {
  card: DippedSmartCardAuth.ProgrammableCardReady;
  systemSettings: SystemSettings;
}): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  const programCardMutation = apiProgramCard.useMutation();
  const unprogramCardMutation = apiUnprogramCard.useMutation();
  const [actionResult, setActionResult] = useState<SmartCardActionResult>();
  const [confirmSystemAdminCardAction, setConfirmSystemAdminCardAction] =
    useState<ConfirmSystemAdminCardAction>();

  function programCard(role: CardRole) {
    assert(role !== 'vendor');

    programCardMutation.mutate(
      { userRole: role },
      {
        onSuccess: (result) => {
          setActionResult({
            action: 'Program',
            newPin: result.ok()?.pin,
            role,
            status: result.isOk() ? 'Success' : 'Error',
          });
        },
      }
    );
  }

  function unprogramCard(role: CardRole) {
    unprogramCardMutation.mutate(undefined, {
      onSuccess: (result) => {
        setActionResult({
          action: 'Unprogram',
          role,
          status: result.isOk() ? 'Success' : 'Error',
        });
      },
    });
  }

  function resetCardPin(role: CardRole) {
    assert(role !== 'vendor');
    programCardMutation.mutate(
      { userRole: role },
      {
        onSuccess: (result) => {
          setActionResult({
            action: 'PinReset',
            newPin: result.ok()?.pin,
            role,
            status: result.isOk() ? 'Success' : 'Error',
          });
        },
      }
    );
  }

  const { programmedUser } = card;
  const { role } = programmedUser ?? {};

  const doesCardElectionMatchMachineElection =
    electionDefinition &&
    programmedUser &&
    (programmedUser.role === 'election_manager' ||
      programmedUser.role === 'poll_worker') &&
    deepEqual(
      programmedUser.electionKey,
      constructElectionKey(electionDefinition.election)
    );

  const electionInfo = doesCardElectionMatchMachineElection ? (
    <ElectionInfo election={electionDefinition.election} />
  ) : (
    'Unknown Election'
  );

  // Don't allow unprogramming system administrator cards to ensure election officials don't get
  // accidentally locked out.
  const unprogramAllowed =
    role === 'election_manager' || role === 'poll_worker';
  // Disable unprogramming when there's no election definition on
  // the machine since cards can't be programmed in this state
  const unprogramDisabled = !electionDefinition;
  const unprogramVariant = doesCardElectionMatchMachineElection
    ? 'danger'
    : 'primary';

  const resetPinAllowed =
    role === 'system_administrator' ||
    role === 'election_manager' ||
    (systemSettings.auth.arePollWorkerCardPinsEnabled &&
      role === 'poll_worker');
  // Because PIN resetting completely reprograms the card under the hood, we also need the
  // relevant election definition to be loaded for election manager and poll worker cards, so
  // that we can write the proper election key
  const resetPinDisabled = !(
    role === 'system_administrator' || doesCardElectionMatchMachineElection
  );

  const createElectionCardsDisabled = !electionDefinition;

  const actionInProgress =
    unprogramCardMutation.isLoading || programCardMutation.isLoading;

  return (
    <SmartCardsScreenContainer>
      <CardIllustration inserted active={actionInProgress}>
        <div style={{ width: '100%' }}>
          <H1>{role ? prettyRoles[role] : 'Blank'} Card</H1>
          {programmedUser && role !== 'system_administrator' && (
            <P>{electionInfo}</P>
          )}
        </div>
        {actionInProgress && (
          <Icons.Loading color="primary" style={{ height: '5rem' }} />
        )}
      </CardIllustration>
      <div style={{ flexGrow: 1 }}>
        {actionResult && (
          <div style={{ padding: '1rem' }}>
            <ActionResultCallout result={actionResult} />
          </div>
        )}
        {programmedUser ? (
          // After a successful action, hide the modify card actions to keep
          // user focus on the success message.
          // Also show no actions section for vendor cards.
          !(actionResult?.status === 'Success' || role === 'vendor') && (
            <CardActions>
              {unprogramAllowed && unprogramDisabled && (
                <Callout color="warning" icon="Info">
                  Configure VxAdmin with an election package to enable modifying
                  cards.
                </Callout>
              )}
              <H2>Modify Card</H2>
              <SmartCardsScreenButtonList>
                {unprogramAllowed && (
                  <Button
                    onPress={() => unprogramCard(role)}
                    disabled={unprogramDisabled || actionInProgress}
                    icon="Delete"
                    variant={unprogramVariant}
                  >
                    Unprogram Card
                  </Button>
                )}
                {resetPinAllowed && (
                  <Button
                    onPress={() => {
                      if (role === 'system_administrator') {
                        setConfirmSystemAdminCardAction({
                          actionType: 'PinReset',
                          doAction: () => resetCardPin(role),
                        });
                      } else {
                        resetCardPin(role);
                      }
                    }}
                    disabled={resetPinDisabled || actionInProgress}
                    variant={
                      role === 'system_administrator' ? 'danger' : undefined
                    }
                    icon="RotateRight"
                  >
                    Reset Card PIN
                  </Button>
                )}
              </SmartCardsScreenButtonList>
            </CardActions>
          )
        ) : (
          <CardActions>
            {createElectionCardsDisabled && (
              <Callout color="warning" icon="Info">
                Configure VxAdmin with an election package to program election
                manager and poll worker cards.
              </Callout>
            )}
            <H2>Program New Card</H2>
            <SmartCardsScreenButtonList style={{ alignItems: 'start' }}>
              <Button
                icon="Add"
                variant="primary"
                onPress={() => programCard('election_manager')}
                disabled={createElectionCardsDisabled || actionInProgress}
              >
                Program Election Manager Card
              </Button>
              <Button
                icon="Add"
                variant="primary"
                onPress={() => programCard('poll_worker')}
                disabled={createElectionCardsDisabled || actionInProgress}
              >
                Program Poll Worker Card
              </Button>
              <Button
                icon="Add"
                onPress={() =>
                  setConfirmSystemAdminCardAction({
                    actionType: 'Program',
                    doAction: () => programCard('system_administrator'),
                  })
                }
                disabled={actionInProgress}
              >
                Program System Administrator Card
              </Button>
            </SmartCardsScreenButtonList>
          </CardActions>
        )}
      </div>
      {confirmSystemAdminCardAction && (
        <ConfirmSystemAdminCardActionModal
          {...confirmSystemAdminCardAction}
          onClose={() => setConfirmSystemAdminCardAction(undefined)}
        />
      )}
    </SmartCardsScreenContainer>
  );
}

export function SmartCardsScreen(): JSX.Element | null {
  const authQuery = getAuthStatus.useQuery();
  const systemSettingsQuery = getSystemSettings.useQuery();

  if (!(authQuery.isSuccess && systemSettingsQuery.isSuccess)) {
    return null;
  }

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
        <CardDetailsAndActions
          card={card}
          systemSettings={systemSettingsQuery.data}
        />
      );

    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(card.status);
    }
  }
}
