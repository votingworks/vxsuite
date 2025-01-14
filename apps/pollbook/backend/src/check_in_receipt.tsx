import { assert, throwIllegalValue } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import styled from 'styled-components';
import { Icons } from '@votingworks/ui';
import { Voter, VoterIdentificationMethod } from './types';

const StyledReceipt = styled.div``;

function capitalizeFirstLetters(str: string): string {
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function prettyIdentificationMethod(
  identificationMethod: VoterIdentificationMethod
) {
  switch (identificationMethod.type) {
    case 'photoId':
      return `Photo ID (${identificationMethod.state})`;
    case 'challengedVoterAffidavit':
      return 'CVA';
    case 'personalRecognizance':
      switch (identificationMethod.recognizer) {
        case 'supervisor':
          return 'PR (Supervisor)';
        case 'moderator':
          return 'PR (Moderator)';
        case 'cityClerk':
          return 'PR (City Clerk)';
        default:
          return throwIllegalValue(identificationMethod.recognizer);
      }
    default:
      throwIllegalValue(identificationMethod);
  }
}

export function CheckInReceipt({
  voter,
  count,
  machineId,
}: {
  voter: Voter;
  count: number;
  machineId: string;
}): JSX.Element {
  const { checkIn } = voter;
  assert(checkIn);

  return (
    <StyledReceipt>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div>
          <div>
            <strong>Check-In Number: {count}</strong>
          </div>
          <div>
            {format.localeNumericDateAndTime(new Date(checkIn.timestamp))}
          </div>
          <div>Pollbook: {machineId}</div>
        </div>

        <Icons.Done style={{ fontSize: '3rem' }} />
      </div>

      <br />

      <div>
        <strong>Voter</strong>
      </div>
      <div>
        {voter.firstName} {voter.middleName} {voter.lastName}
      </div>
      <div>{voter.voterId}</div>
      <div>
        Check-In Method:{' '}
        {prettyIdentificationMethod(checkIn.identificationMethod)}
      </div>
    </StyledReceipt>
  );
}
