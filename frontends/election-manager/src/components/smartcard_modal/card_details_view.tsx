import React, { useContext, useState } from 'react';
import { assert, format, throwIllegalValue } from '@votingworks/utils';
import {
  Button,
  Prose,
  fontSizeTheme,
  HorizontalRule,
  Text,
} from '@votingworks/ui';
import { CardProgramming, ElectionDefinition, User } from '@votingworks/types';

import { AppContext } from '../../contexts/app_context';
import { generatePin } from './pins';
import { SmartcardActionStatus, StatusMessage } from './status_message';
import { UnprogramCardConfirmationModal } from './unprogram_card_confirmation_modal';
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
  const [
    isUnprogramCardConfirmationModalOpen,
    setIsUnprogramCardConfirmationModalOpen,
  ] = useState(false);

  const { role } = programmedUser;
  const doesCardElectionHashMatchMachineElectionHash =
    electionDefinition &&
    checkDoesCardElectionHashMatchMachineElectionHash(
      programmedUser,
      electionDefinition
    );
  const cardJustProgrammed =
    actionStatus?.action === 'Program' && actionStatus?.status === 'Success';

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

  function openUnprogramCardConfirmationModal() {
    setIsUnprogramCardConfirmationModalOpen(true);
  }

  function closeUnprogramCardConfirmationModal() {
    setIsUnprogramCardConfirmationModalOpen(false);
  }

  const election = electionDefinition?.election;
  const electionDisplayString =
    election && doesCardElectionHashMatchMachineElectionHash
      ? `${election.title} — ${format.localeWeekdayAndDate(
          new Date(election.date)
        )}`
      : 'Unknown Election';

  return (
    <Prose textCenter theme={fontSizeTheme.large}>
      <h1>{userRoleToReadableString(role)} Card</h1>
      {role !== 'superadmin' && <p>{electionDisplayString}</p>}
      <HorizontalRule />
      {actionStatus ? (
        <Text style={{ fontSize: '1.5em' }}>
          <StatusMessage
            actionStatus={actionStatus}
            programmedUser={programmedUser}
          />
        </Text>
      ) : (
        <p>
          {'passcode' in programmedUser &&
            (role === 'superadmin' ||
              // If the card is from a prior election, no need to display PIN resetting. Unprogramming is
              // the only meaningful action in this case
              doesCardElectionHashMatchMachineElectionHash) && (
              <Button disabled={cardJustProgrammed} onPress={resetCardPin}>
                Reset Card PIN
              </Button>
            )}
          {/* Don't allow unprogramming super admin cards to ensure election officials don't get
            accidentally locked out. Likewise prevent unprogramming when there's no election definition
            on the machine since cards can't be programmed in this state */}
          {(role === 'admin' || role === 'pollworker') && electionDefinition && (
            <React.Fragment>
              {' '}
              <Button
                danger={doesCardElectionHashMatchMachineElectionHash}
                onPress={openUnprogramCardConfirmationModal}
                primary={!doesCardElectionHashMatchMachineElectionHash}
              >
                Unprogram Card
              </Button>
              {isUnprogramCardConfirmationModalOpen && (
                <UnprogramCardConfirmationModal
                  actionStatus={actionStatus}
                  card={card}
                  closeModal={closeUnprogramCardConfirmationModal}
                  programmedUserRole={role}
                  setActionStatus={setActionStatus}
                />
              )}
            </React.Fragment>
          )}
        </p>
      )}
      <HorizontalRule />
      {actionStatus ? (
        <Text bold>Remove card to continue.</Text>
      ) : (
        <p>Remove card to cancel.</p>
      )}
    </Prose>
  );
}
