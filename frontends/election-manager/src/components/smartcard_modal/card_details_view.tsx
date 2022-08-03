import React, { useContext } from 'react';
import styled from 'styled-components';
import { assert, throwIllegalValue } from '@votingworks/utils';
import {
  Button,
  fontSizeTheme,
  HorizontalRule,
  Prose,
  Text,
} from '@votingworks/ui';
import { CardProgramming, ElectionDefinition, User } from '@votingworks/types';

import { AppContext } from '../../contexts/app_context';
import { electionToDisplayString } from './elections';
import { generatePin } from './pins';
import { SmartcardActionStatus, StatusMessage } from './status_message';
import { userRoleToReadableString } from './user_roles';

interface StatusMessageContainerProps {
  large?: boolean;
}

const StatusMessageContainer = styled.p<StatusMessageContainerProps>`
  font-size: ${(props) => (props.large ? '1.5em' : undefined)};
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
  card: CardProgramming;
  setActionStatus: (status?: SmartcardActionStatus) => void;
}

export function CardDetailsView({
  actionStatus,
  card,
  setActionStatus,
}: Props): JSX.Element {
  const { programmedUser } = card;
  assert(programmedUser);
  const { electionDefinition } = useContext(AppContext);

  const { role } = programmedUser;
  const doesCardElectionHashMatchMachineElectionHash =
    electionDefinition &&
    checkDoesCardElectionHashMatchMachineElectionHash(
      programmedUser,
      electionDefinition
    );
  const showingSuccessOrErrorMessage =
    actionStatus?.status === 'Success' || actionStatus?.status === 'Error';

  async function resetCardPin() {
    assert(electionDefinition);
    assert(role === 'superadmin' || role === 'admin');

    setActionStatus({
      action: 'PinReset',
      role,
      status: 'InProgress',
    });
    let result;
    switch (role) {
      case 'superadmin': {
        result = await card.programUser({
          role: 'superadmin',
          passcode: generatePin(),
        });
        break;
      }
      case 'admin': {
        result = await card.programUser({
          role: 'admin',
          electionData: electionDefinition.electionData,
          electionHash: electionDefinition.electionHash,
          passcode: generatePin(),
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
    const result = await card.unprogramUser();
    setActionStatus({
      action: 'Unprogram',
      role,
      status: result.isOk() ? 'Success' : 'Error',
    });
  }

  const electionDisplayString = doesCardElectionHashMatchMachineElectionHash
    ? electionToDisplayString(electionDefinition.election)
    : 'Unknown Election';

  const possibleActions = new Set<SmartcardActionStatus['action']>();
  if (
    'passcode' in programmedUser &&
    (role === 'superadmin' ||
      // If the card is from a prior election, no need to display PIN resetting. Unprogramming is
      // the only meaningful action in this case
      doesCardElectionHashMatchMachineElectionHash)
  ) {
    possibleActions.add('PinReset');
  }
  // Don't allow unprogramming super admin cards to ensure election officials don't get
  // accidentally locked out. Likewise prevent unprogramming when there's no election definition on
  // the machine since cards can't be programmed in this state
  if ((role === 'admin' || role === 'pollworker') && electionDefinition) {
    possibleActions.add('Unprogram');
  }

  return (
    <Prose textCenter theme={fontSizeTheme.medium}>
      <h1>{userRoleToReadableString(role)} Card</h1>
      {role !== 'superadmin' && <p>{electionDisplayString}</p>}

      <HorizontalRule />
      {actionStatus && (
        <StatusMessageContainer large={actionStatus.status === 'Success'}>
          <StatusMessage
            actionStatus={actionStatus}
            programmedUser={programmedUser}
          />
        </StatusMessageContainer>
      )}
      {!showingSuccessOrErrorMessage && possibleActions.size > 0 && (
        <p>
          {possibleActions.has('PinReset') && (
            <Button onPress={resetCardPin}>Reset Card PIN</Button>
          )}
          {possibleActions.size > 1 && ' '}
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
      )}
      {(actionStatus || possibleActions.size > 0) && <HorizontalRule />}

      {showingSuccessOrErrorMessage ? (
        <Text bold>Remove card to continue.</Text>
      ) : (
        <p>
          Remove card to{' '}
          {possibleActions.size > 0 ? 'cancel' : 'leave this screen'}.
        </p>
      )}
    </Prose>
  );
}
