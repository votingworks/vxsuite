import React, { useContext } from 'react';
import styled from 'styled-components';
import { assert } from '@votingworks/basics';
import { ElectionDefinition, User } from '@votingworks/types';
import {
  Button,
  fontSizeTheme,
  HorizontalRule,
  Prose,
  Text,
} from '@votingworks/ui';

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

const StatusMessageContainer = styled.div`
  margin-bottom: 2.5em;
`;

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
  programmedUser: User;
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
    systemSettingsQuery.data?.arePollWorkerCardPinsEnabled;
  const doesCardElectionHashMatchMachineElectionHash =
    electionDefinition &&
    checkDoesCardElectionHashMatchMachineElectionHash(
      programmedUser,
      electionDefinition
    );

  function resetCardPin() {
    assert(role !== 'cardless_voter');

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
        <HorizontalRule />
        <SuccessOrErrorStatusMessage actionStatus={actionStatus} />
        <HorizontalRule />

        <Text bold>Remove card to continue.</Text>
      </React.Fragment>
    );
  } else if (possibleActions.size > 0) {
    bodyContent = (
      <React.Fragment>
        <HorizontalRule />
        <p>
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
        </p>
        <HorizontalRule />

        <p>Remove card to cancel.</p>
      </React.Fragment>
    );
  } else if (!electionDefinition) {
    bodyContent = (
      <React.Fragment>
        <HorizontalRule />
        <p>An election must be defined before cards can be created.</p>
        <HorizontalRule />

        <p>Remove card to leave this screen.</p>
      </React.Fragment>
    );
  } else {
    bodyContent = <p>Remove card to leave this screen.</p>;
  }

  return (
    <React.Fragment>
      {actionStatus?.status === 'Error' && (
        <StatusMessageContainer>
          <Prose textCenter themeDeprecated={fontSizeTheme.medium}>
            <SuccessOrErrorStatusMessage actionStatus={actionStatus} />
          </Prose>
        </StatusMessageContainer>
      )}

      <Prose textCenter themeDeprecated={fontSizeTheme.medium}>
        <h1>{userRoleToReadableString(role)} Card</h1>
        {role !== 'system_administrator' && <p>{electionDisplayString}</p>}
        {bodyContent}
      </Prose>
    </React.Fragment>
  );
}
