import styled from 'styled-components';
import { assert, deepEqual, throwIllegalValue } from '@votingworks/basics';
import {
  Button,
  Callout,
  H1,
  H2,
  H3,
  Icons,
  InsertCardImage,
  Modal,
  P,
  RotateCardImage,
  SmartCardChipImage,
} from '@votingworks/ui';

import {
  format,
  hyphenatePin,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import {
  constructElectionKey,
  DippedSmartCardAuth,
  Election,
  SystemSettings,
  UserWithCard,
} from '@votingworks/types';
import React, { useContext, useState } from 'react';
import { NavigationScreen } from '../components/navigation_screen';
import { AppContext } from '../contexts/app_context';
import {
  getSystemSettings,
  programCard as apiProgramCard,
  unprogramCard as apiUnprogramCard,
  getAuthStatus,
} from '../api';

function toLowerCaseExceptFirst(str: string): string {
  if (str.length === 0) {
    return str;
  }

  const firstLetter = str[0];
  const restOfString = str.slice(1).toLowerCase();

  return firstLetter + restOfString;
}

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

const CardPin = styled.div`
  font-size: 2.5rem;
  font-weight: bold;
  color: ${(p) => p.theme.colors.primary};
`;

function ActionResultCallout({ result }: { result: SmartCardActionResult }) {
  const { action, newPin, status } = result;
  const cardRole = prettyRoles[result.role];

  if (status === 'Error') {
    let text: string;
    switch (action) {
      case 'Program': {
        text = `Error creating ${cardRole.toLowerCase()} card.`;
        break;
      }
      case 'PinReset': {
        text = `Error resetting ${cardRole.toLowerCase()} card PIN.`;
        break;
      }
      case 'Unprogram': {
        text = `Error unprogramming ${cardRole.toLowerCase()} card.`;
        break;
      }
      /* istanbul ignore next */
      default: {
        throwIllegalValue(action);
      }
    }
    return (
      <Callout color="danger" icon="Danger">
        {text} Please try again.
      </Callout>
    );
  }

  switch (action) {
    case 'Program':
      return (
        <Callout color="primary" icon="Done">
          <div>
            {toLowerCaseExceptFirst(cardRole)} card created.
            {newPin ? (
              <React.Fragment>
                <br />
                <H3>Record the new PIN:</H3>
                <CardPin>{hyphenatePin(newPin)}</CardPin>
                <br />
                Then remove card to continue.
              </React.Fragment>
            ) : (
              <React.Fragment> Remove card to continue.</React.Fragment>
            )}
          </div>
        </Callout>
      );

    case 'PinReset': {
      assert(newPin !== undefined);
      return (
        <Callout color="primary" icon="Done">
          <div>
            {toLowerCaseExceptFirst(cardRole)} card PIN has been reset.
            <br />
            <H3>Record the new PIN:</H3>
            <CardPin>{hyphenatePin(newPin)}</CardPin>
            <br />
            Then remove card to continue.
          </div>
        </Callout>
      );
    }

    case 'Unprogram':
      return (
        <Callout color="primary" icon="Done">
          {toLowerCaseExceptFirst(cardRole)} card has been unprogrammed.
        </Callout>
      );

    /* istanbul ignore next */
    default:
      return throwIllegalValue(action);
  }
}

function ElectionInfo({ election }: { election: Election }) {
  return (
    <React.Fragment>
      {election.title}
      <br />
      {format.localeWeekdayAndDate(
        election.date.toMidnightDatetimeWithSystemTimezone()
      )}
    </React.Fragment>
  );
}

const CardIllustrationContainer = styled.div<{
  inserted?: boolean;
  active?: boolean;
}>`
  height: 100%;
  padding: 1rem;
  background: ${(p) => p.theme.colors.containerLow};

  > div {
    width: 20rem;
    border-radius: 1.5rem;
    background: ${(p) => p.inserted && p.theme.colors.background};
    border-width: ${(p) =>
      p.active
        ? p.theme.sizes.bordersRem.medium
        : p.theme.sizes.bordersRem.thin}rem;
    border-style: ${(p) => (p.inserted ? 'solid' : 'dashed')};
    border-color: ${(p) =>
      p.active ? p.theme.colors.primary : p.theme.colors.outline};
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: ${(p) => (p.inserted ? 'space-between' : 'center')};
    padding: ${(p) => (p.inserted ? '5rem 2rem 3rem 2rem' : '2rem')};
    flex-direction: column;
    gap: 1rem;
  }
`;

const SmartCardChipImageContainer = styled.div`
  margin-right: 3rem;

  svg {
    width: 3.5rem;
    background: ${(p) => p.theme.colors.containerLow};
  }
`;

function CardIllustration({
  inserted,
  active,
  children,
}: {
  inserted: boolean;
  active?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <CardIllustrationContainer inserted={inserted} active={active}>
      <div>
        {children}
        {inserted && (
          <SmartCardChipImageContainer>
            <SmartCardChipImage />
          </SmartCardChipImageContainer>
        )}
      </div>
    </CardIllustrationContainer>
  );
}

const ImageWrapper = styled.div`
  height: 12rem;
  display: flex;
`;

const CardActions = styled.div`
  padding: 1rem;
  display: flex;
  flex-direction: column;
`;

const ButtonList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: start;
`;

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

function InsertCardPrompt({
  cardStatus,
}: {
  cardStatus: 'no_card' | 'card_error';
}) {
  return (
    <SmartCardsScreenContainer>
      <CardIllustration inserted={false}>
        {cardStatus === 'no_card' ? (
          <React.Fragment>
            <ImageWrapper>
              <InsertCardImage cardInsertionDirection="right" />
            </ImageWrapper>
            <H2>Insert a Smart Card</H2>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <ImageWrapper>
              <RotateCardImage cardInsertionDirection="right" />
            </ImageWrapper>
            <H2>Card is Backwards</H2>
          </React.Fragment>
        )}
      </CardIllustration>
      <CardActions>
        <Callout color="primary" icon="Info">
          Insert a blank smart card to create a new card. Insert a previously
          used card to modify it.
        </Callout>
        <ButtonList style={{ alignItems: 'start', marginTop: '1rem' }}>
          <Button onPress={() => {}} disabled>
            Create Election Manager Card
          </Button>
          <Button onPress={() => {}} disabled>
            Create Poll Worker Card
          </Button>
          <Button onPress={() => {}} disabled>
            Create System Administrator Card
          </Button>
        </ButtonList>
      </CardActions>
    </SmartCardsScreenContainer>
  );
}

interface ConfirmSystemAdminCardAction {
  actionType: 'Program' | 'PinReset';
  doAction: VoidFunction;
}

function ConfirmSystemAdminCardActionModal({
  actionType,
  doAction,
  onClose,
}: ConfirmSystemAdminCardAction & { onClose: VoidFunction }) {
  const { title, content, confirmLabel } = (() => {
    switch (actionType) {
      case 'Program':
        return {
          title: 'Create System Administrator Card?',
          content: (
            <React.Fragment>
              <P>This card performs all system actions.</P>
              <P>
                Strictly limit the number created and keep all System
                Administrator cards secure.
              </P>
            </React.Fragment>
          ),
          confirmLabel: 'Create System Administrator Card',
        };

      case 'PinReset':
        return {
          title: 'Reset System Administrator Card PIN?',
          content: (
            <P>
              The old PIN will no longer work. After resetting the PIN, you must
              record the new PIN to avoid being locked out of this machine.
            </P>
          ),
          confirmLabel: 'Reset System Administrator Card PIN',
        };

      /* istanbul ignore next */
      default:
        return throwIllegalValue(actionType);
    }
  })();

  return (
    <Modal
      onOverlayClick={onClose}
      title={
        <span>
          <Icons.Warning color="warning" /> {title}
        </span>
      }
      content={content}
      actions={
        <React.Fragment>
          <Button
            onPress={() => {
              doAction();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
    />
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
    assert(electionDefinition);
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
          // user focus on the success message
          !(actionResult?.status === 'Success') && (
            <CardActions>
              {unprogramAllowed && unprogramDisabled && (
                <Callout color="warning" icon="Info">
                  Configure VxAdmin with an election package to enable modifying
                  cards.
                </Callout>
              )}
              <H2>Modify Card</H2>
              <ButtonList>
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
              </ButtonList>
            </CardActions>
          )
        ) : (
          <CardActions>
            {createElectionCardsDisabled && (
              <Callout color="warning" icon="Info">
                Configure VxAdmin with an election package to create election
                manager and poll worker cards.
              </Callout>
            )}
            <H2>Create New Card</H2>
            <ButtonList style={{ alignItems: 'start' }}>
              <Button
                icon="Add"
                variant="primary"
                onPress={() => programCard('election_manager')}
                disabled={createElectionCardsDisabled || actionInProgress}
              >
                Create Election Manager Card
              </Button>
              <Button
                icon="Add"
                variant="primary"
                onPress={() => programCard('poll_worker')}
                disabled={createElectionCardsDisabled || actionInProgress}
              >
                Create Poll Worker Card
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
                Create System Administrator Card
              </Button>
            </ButtonList>
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
      return <InsertCardPrompt cardStatus={card.status} />;

    case 'ready':
      return (
        <CardDetailsAndActions
          card={card}
          systemSettings={systemSettingsQuery.data}
        />
      );

    /* istanbul ignore next */
    default:
      return throwIllegalValue(card.status);
  }
}
