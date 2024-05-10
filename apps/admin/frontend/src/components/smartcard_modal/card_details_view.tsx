import React, { useContext } from 'react';
import { assert } from '@votingworks/basics';
import { ElectionDefinition, User, UserWithCard } from '@votingworks/types';
import { Button, Font, H1, P } from '@votingworks/ui';

import {
  getSystemSettings,
  programCard,
  unprogramCard as unprogramCardBase,
} from '../../api';
import { AppContext } from '../../contexts/app_context';
import { electionToDisplayString } from './elections';
import {
  SmartcardAction,
  SmartcardActionStatus,
  SuccessOrErrorStatusMessage,
} from './status_message';
import { userRoleToReadableString } from './user_roles';

function checkDoesCardElectionHashMatchMachineElectionHash(
  programmedUser: User,
  electionDefinition: ElectionDefinition
): boolean {
  if (!('electionHash' in programmedUser)) {
    return false;
  }
  return programmedUser.electionHash === electionDefinition.electionHash;
}

interface Props {
  actionStatus?: SmartcardActionStatus;
  programmedUser: UserWithCard;
  setActionStatus: (actionStatus?: SmartcardActionStatus) => void;
}

export function CardDetailsView({
  actionStatus,
  programmedUser,
  setActionStatus,
}: Props): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  const systemSettingsQuery = getSystemSettings.useQuery();
  const programCardMutation = programCard.useMutation();
  const unprogramCardMutation = unprogramCardBase.useMutation();

  const { role } = programmedUser;
  const arePollWorkerCardPinsEnabled =
    systemSettingsQuery.data?.auth.arePollWorkerCardPinsEnabled;
  const doesCardElectionHashMatchMachineElectionHash =
    electionDefinition &&
    checkDoesCardElectionHashMatchMachineElectionHash(
      programmedUser,
      electionDefinition
    );

  function resetCardPin() {
    assert(role !== 'vendor');

    setActionStatus({
      action: 'PinReset',
      role,
      status: 'InProgress',
    });
    programCardMutation.mutate(
      { userRole: role },
      {
        onSuccess: (result) => {
          setActionStatus({
            action: 'PinReset',
            newPin: result.ok()?.pin,
            role,
            status: result.isOk() ? 'Success' : 'Error',
          });
        },
      }
    );
  }

  function unprogramCard() {
    setActionStatus({
      action: 'Unprogram',
      role,
      status: 'InProgress',
    });
    unprogramCardMutation.mutate(undefined, {
      onSuccess: (result) => {
        setActionStatus({
          action: 'Unprogram',
          role,
          status: result.isOk() ? 'Success' : 'Error',
        });
      },
    });
  }

  const electionDisplayString = doesCardElectionHashMatchMachineElectionHash
    ? electionToDisplayString(electionDefinition.election)
    : 'Unknown Election';

  const possibleActions = new Set<SmartcardAction>();
  if (
    role === 'system_administrator' ||
    // Because PIN resetting completely reprograms the card under the hood, we also need the
    // relevant election definition to be loaded for election manager and poll worker cards, so
    // that we can write the proper election hash (and for election manager cards, full election
    // definition)
    (doesCardElectionHashMatchMachineElectionHash &&
      (role === 'election_manager' ||
        (arePollWorkerCardPinsEnabled && role === 'poll_worker')))
  ) {
    possibleActions.add('PinReset');
  }
  // Don't allow unprogramming system administrator cards to ensure election officials don't get
  // accidentally locked out. Likewise prevent unprogramming when there's no election definition on
  // the machine since cards can't be programmed in this state
  if (
    (role === 'election_manager' || role === 'poll_worker') &&
    electionDefinition
  ) {
    possibleActions.add('Unprogram');
  }

  let bodyContent: JSX.Element;
  if (actionStatus?.status === 'Success') {
    bodyContent = (
      <React.Fragment>
        <SuccessOrErrorStatusMessage actionStatus={actionStatus} />
        <P weight="bold">Remove card to continue.</P>
      </React.Fragment>
    );
  } else if (possibleActions.size > 0) {
    bodyContent = (
      <React.Fragment>
        <P>
          {possibleActions.has('PinReset') && (
            <Button onPress={resetCardPin}>Reset Card PIN</Button>
          )}{' '}
          {possibleActions.has('Unprogram') && (
            <Button
              variant={
                doesCardElectionHashMatchMachineElectionHash
                  ? 'danger'
                  : 'primary'
              }
              onPress={unprogramCard}
            >
              Unprogram Card
            </Button>
          )}
        </P>

        <P>Remove card to cancel.</P>
      </React.Fragment>
    );
  } else if (
    ['election_manager', 'poll_worker'].includes(role) &&
    !electionDefinition
  ) {
    bodyContent = (
      <React.Fragment>
        <P>An election must be defined before cards can be created.</P>
        <P>Remove card to leave this screen.</P>
      </React.Fragment>
    );
  } else {
    bodyContent = <P>Remove card to leave this screen.</P>;
  }

  return (
    <React.Fragment>
      {actionStatus?.status === 'Error' && (
        <SuccessOrErrorStatusMessage actionStatus={actionStatus} />
      )}

      <Font align="center">
        <H1>{userRoleToReadableString(role)} Card</H1>
        {role !== 'vendor' && role !== 'system_administrator' && (
          <P>{electionDisplayString}</P>
        )}
        {bodyContent}
      </Font>
    </React.Fragment>
  );
}
