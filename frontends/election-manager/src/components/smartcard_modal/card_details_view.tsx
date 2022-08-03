import React, { useContext } from 'react';
import styled from 'styled-components';
import { assert, format, throwIllegalValue } from '@votingworks/utils';
import { Button, Prose, Table } from '@votingworks/ui';
import { CardProgramming, ElectionDefinition, User } from '@votingworks/types';

import { AppContext } from '../../contexts/app_context';
import { generatePin } from './pins';
import { SmartcardActionStatus, StatusMessage } from './status_message';
import { userRoleToReadableString } from './user_roles';

const CardDetailsTable = styled(Table)`
  margin: auto;
  width: auto;
  min-width: 25%;
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

  let electionDisplayString = 'Unknown';
  if (doesCardElectionHashMatchMachineElectionHash) {
    const { election } = electionDefinition;
    const electionDateFormatted = format.localeWeekdayAndDate(
      new Date(election.date)
    );
    electionDisplayString = `${election.title} — ${electionDateFormatted}`;
  } else if (role === 'superadmin') {
    electionDisplayString = 'N/A';
  }

  return (
    <Prose textCenter>
      <h2>Card Details</h2>
      {/* An empty div to maintain space between the header and subsequent p. TODO: Consider adding
        a `maintainSpaceBelowHeaders` prop to `Prose` */}
      <div />
      {actionStatus && (
        <StatusMessage
          actionStatus={actionStatus}
          programmedUser={programmedUser}
        />
      )}
      <CardDetailsTable>
        <thead>
          <tr>
            <th>Role</th>
            <th>Election</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{userRoleToReadableString(role)}</td>
            <td>{electionDisplayString}</td>
          </tr>
        </tbody>
      </CardDetailsTable>
      <p>Remove card to leave this screen.</p>
      {'passcode' in programmedUser &&
        (role === 'superadmin' ||
          // If the card is from a prior election, no need to display PIN resetting. Unprogramming is
          // the only meaningful action in this case
          doesCardElectionHashMatchMachineElectionHash) && (
          <p>
            <Button disabled={cardJustProgrammed} onPress={resetCardPin}>
              Reset Card PIN
            </Button>
          </p>
        )}
      {/* Don't allow unprogramming super admin cards to ensure election officials don't get
        accidentally locked out. Likewise prevent unprogramming when there's no election definition
        on the machine since cards can't be programmed in this state */}
      {(role === 'admin' || role === 'pollworker') && electionDefinition && (
        <React.Fragment>
          <p>
            <Button
              danger={doesCardElectionHashMatchMachineElectionHash}
              onPress={unprogramCard}
              primary={!doesCardElectionHashMatchMachineElectionHash}
            >
              Unprogram Card
            </Button>
          </p>
        </React.Fragment>
      )}
    </Prose>
  );
}
