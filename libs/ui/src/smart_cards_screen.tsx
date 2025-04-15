import styled from 'styled-components';
import {
  assert,
  deepEqual,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import { format, hyphenatePin } from '@votingworks/utils';
import {
  constructElectionKey,
  DippedSmartCardAuth,
  Election,
  UserWithCard,
} from '@votingworks/types';
import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Callout } from './callout';
import { H1, H2, H3, P } from './typography';
import { Button } from './button';
import { Modal } from './modal';
import { Icons } from './icons';
import { CardIllustration } from './card_illustration';
import { InsertCardImage, RotateCardImage } from './smart_card_images';

export const SmartCardsScreenButtonList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: start;
`;

function toLowerCaseExceptFirst(str: string): string {
  /* istanbul ignore next - @preserve */
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

const ImageWrapper = styled.div`
  height: 12rem;
  display: flex;
`;

const CardActions = styled.div`
  padding: 1rem;
  display: flex;
  flex-direction: column;
`;

export function ElectionInfo({
  election,
}: {
  election: Election;
}): JSX.Element {
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

export function InsertCardPrompt({
  cardStatus,
}: {
  cardStatus: 'no_card' | 'card_error';
}): JSX.Element {
  return (
    <React.Fragment>
      <CardIllustration inserted={false}>
        {cardStatus === 'no_card' ? (
          <React.Fragment>
            <ImageWrapper>
              <InsertCardImage cardInsertionDirection="right" />
            </ImageWrapper>
            <H2>Insert a smart card</H2>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <ImageWrapper>
              <RotateCardImage cardInsertionDirection="right" />
            </ImageWrapper>
            <H2>Card Backward</H2>
          </React.Fragment>
        )}
      </CardIllustration>
      <CardActions>
        <Callout color="primary" icon="Info">
          Insert a smart card to program or modify it.
        </Callout>
        <SmartCardsScreenButtonList
          style={{ alignItems: 'start', marginTop: '1rem' }}
        >
          <Button onPress={() => {}} disabled>
            Program Election Manager Card
          </Button>
          <Button onPress={() => {}} disabled>
            Program Poll Worker Card
          </Button>
          <Button onPress={() => {}} disabled>
            Program System Administrator Card
          </Button>
        </SmartCardsScreenButtonList>
      </CardActions>
    </React.Fragment>
  );
}

type SmartCardAction = 'Program' | 'PinReset' | 'Unprogram';

export interface SmartCardActionResult {
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

export function ActionResultCallout({
  result,
}: {
  result: SmartCardActionResult;
}): JSX.Element {
  const { action, newPin, status } = result;
  const cardRole = prettyRoles[result.role];

  if (status === 'Error') {
    let text: string;
    switch (action) {
      case 'Program': {
        text = `Error programming ${cardRole.toLowerCase()} card.`;
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
      default: {
        /* istanbul ignore next - @preserve */
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
            {toLowerCaseExceptFirst(cardRole)} card programmed.
            {newPin ? (
              <React.Fragment>
                <br />
                <H3>Record the new PIN:</H3>
                <CardPin>{hyphenatePin(newPin)}</CardPin>
                <br />
                Remove card to continue.
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
            {toLowerCaseExceptFirst(cardRole)} card PIN reset.
            <br />
            <H3>Record the new PIN:</H3>
            <CardPin>{hyphenatePin(newPin)}</CardPin>
            <br />
            Remove card to continue.
          </div>
        </Callout>
      );
    }

    case 'Unprogram':
      return (
        <Callout color="primary" icon="Done">
          {toLowerCaseExceptFirst(cardRole)} card unprogrammed.
        </Callout>
      );

    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(action);
    }
  }
}

interface ConfirmSystemAdminCardAction {
  actionType: 'Program' | 'PinReset';
  doAction: VoidFunction;
}

export function ConfirmSystemAdminCardActionModal({
  actionType,
  doAction,
  onClose,
}: ConfirmSystemAdminCardAction & { onClose: VoidFunction }): JSX.Element {
  const { title, content, confirmLabel } = (() => {
    switch (actionType) {
      case 'Program':
        return {
          title: 'Program System Administrator Card',
          content: (
            <React.Fragment>
              <P>System administrator cards have full system access.</P>
              <P>
                Limit the number of system administrator cards and keep them
                secure.
              </P>
            </React.Fragment>
          ),
          confirmLabel: 'Program System Administrator Card',
        };

      case 'PinReset':
        return {
          title: 'Reset System Administrator Card PIN',
          content: (
            <P>
              The old PIN will no longer work. After resetting the PIN, you must
              record the new PIN to avoid being locked out of this machine.
            </P>
          ),
          confirmLabel: 'Reset System Administrator Card PIN',
        };

      default: {
        /* istanbul ignore next - @preserve */
        throwIllegalValue(actionType);
      }
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

export interface CardProgrammingApiClient {
  programCard: (input: {
    userRole: 'system_administrator' | 'election_manager' | 'poll_worker';
  }) => Promise<
    Result<
      {
        pin?: string;
      },
      Error
    >
  >;
  unprogramCard: () => Promise<Result<void, Error>>;
}

export function CardDetailsAndActions({
  card,
  arePollWorkerCardPinsEnabled,
  election,
  apiClient,
}: {
  card: DippedSmartCardAuth.ProgrammableCardReady;
  arePollWorkerCardPinsEnabled: boolean;
  election: Election;
  apiClient: CardProgrammingApiClient;
}): JSX.Element {
  const [actionResult, setActionResult] = useState<SmartCardActionResult>();
  const [confirmSystemAdminCardAction, setConfirmSystemAdminCardAction] =
    useState<ConfirmSystemAdminCardAction>();

  const programCardMutation = useMutation(
    (input: {
      userRole: 'system_administrator' | 'election_manager' | 'poll_worker';
    }) => apiClient.programCard(input)
  );

  const unprogramCardMutation = useMutation(() => apiClient.unprogramCard());

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
    election &&
    programmedUser &&
    (programmedUser.role === 'election_manager' ||
      programmedUser.role === 'poll_worker') &&
    deepEqual(programmedUser.electionKey, constructElectionKey(election));

  const electionInfo = doesCardElectionMatchMachineElection ? (
    <ElectionInfo election={election} />
  ) : (
    'Unknown Election'
  );

  // Don't allow unprogramming system administrator cards to ensure election officials don't get
  // accidentally locked out.
  const unprogramAllowed =
    role === 'election_manager' || role === 'poll_worker';
  // Disable unprogramming when there's no election on
  // the machine since cards can't be programmed in this state
  const unprogramDisabled = !election;
  const unprogramVariant = doesCardElectionMatchMachineElection
    ? 'danger'
    : 'primary';

  const resetPinAllowed =
    role === 'system_administrator' ||
    role === 'election_manager' ||
    (arePollWorkerCardPinsEnabled && role === 'poll_worker');
  // Because PIN resetting completely reprograms the card under the hood, we also need the
  // relevant election definition to be loaded for election manager and poll worker cards, so
  // that we can write the proper election key
  const resetPinDisabled = !(
    role === 'system_administrator' || doesCardElectionMatchMachineElection
  );

  const createElectionCardsDisabled = !election;

  const actionInProgress =
    unprogramCardMutation.isLoading || programCardMutation.isLoading;

  return (
    <React.Fragment>
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
    </React.Fragment>
  );
}
