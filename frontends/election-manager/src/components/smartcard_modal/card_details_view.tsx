import React, { useContext } from 'react';
import styled from 'styled-components';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  Button,
  fontSizeTheme,
  HorizontalRule,
  Prose,
  Text,
} from '@votingworks/ui';
import { ElectionDefinition, User } from '@votingworks/types';

import { AppContext } from '../../contexts/app_context';
import { electionToDisplayString } from './elections';
import {
  SmartcardAction,
  SmartcardActionStatus,
  SuccessOrErrorStatusMessage,
} from './status_message';
import { useApiClient } from '../../api';
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
  const apiClient = useApiClient();

  const { role } = programmedUser;
  const doesCardElectionHashMatchMachineElectionHash =
    electionDefinition &&
    checkDoesCardElectionHashMatchMachineElectionHash(
      programmedUser,
      electionDefinition
    );

  async function resetCardPin() {
    assert(role === 'system_administrator' || role === 'election_manager');

    setActionStatus({
      action: 'PinReset',
      role,
      status: 'InProgress',
    });
    let result;
    switch (role) {
      case 'system_administrator': {
        result = await apiClient.programCard({
          userRole: 'system_administrator',
        });
        break;
      }
      case 'election_manager': {
        assert(electionDefinition);
        result = await apiClient.programCard({
          userRole: 'election_manager',
        });
        break;
      }
      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(role);
      }
    }
    setActionStatus({
      action: 'PinReset',
      role,
      status: result.isOk() ? 'Success' : 'Error',
    });
  }

  async function unprogramCard() {
    setActionStatus({
      action: 'Unprogram',
      role,
      status: 'InProgress',
    });
    const result = await apiClient.unprogramCard();
    setActionStatus({
      action: 'Unprogram',
      role,
      status: result.isOk() ? 'Success' : 'Error',
    });
  }

  const electionDisplayString = doesCardElectionHashMatchMachineElectionHash
    ? electionToDisplayString(electionDefinition.election)
    : 'Unknown Election';

  const possibleActions = new Set<SmartcardAction>();
  if (
    'passcode' in programmedUser &&
    (role === 'system_administrator' ||
      // We can support PIN resets on cards from other elections once we update PIN resetting to
      // change only PINs and leave other card data, like election definitions, intact. As of
      // 8/4/22, PIN resetting reprograms cards entirely
      doesCardElectionHashMatchMachineElectionHash)
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
        <SuccessOrErrorStatusMessage
          actionStatus={actionStatus}
          programmedUser={programmedUser}
        />
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
              danger={doesCardElectionHashMatchMachineElectionHash}
              onPress={unprogramCard}
              primary={!doesCardElectionHashMatchMachineElectionHash}
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
