import { assert, throwIllegalValue } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { Icons } from '@votingworks/ui';
import { Voter, VoterIdentificationMethod } from '../types';
import {
  VoterAddress,
  StyledReceipt,
  VoterName,
  PartyName,
} from './receipt_helpers';

function prettyIdentificationMethod(
  identificationMethod: VoterIdentificationMethod
) {
  switch (identificationMethod.type) {
    case 'photoId':
      return `Photo ID (${identificationMethod.state})`;
    case 'personalRecognizance': {
      const { recognizerType, recognizerInitials } = identificationMethod;
      return `P-${
        {
          supervisor: 'S',
          moderator: 'M',
          cityClerk: 'C',
        }[recognizerType]
      }-${recognizerInitials}`;
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
          {checkIn.isAbsentee && <div>Absentee</div>}
          <div>
            {format.localeNumericDateAndTime(new Date(checkIn.timestamp))}
          </div>
          <div>Pollbook: {machineId}</div>
        </div>

        {checkIn.isAbsentee ? (
          <Icons.Envelope style={{ fontSize: '3rem' }} />
        ) : (
          <Icons.Done style={{ fontSize: '3rem' }} />
        )}
      </div>

      <br />

      <div>
        <strong>Voter</strong>
      </div>
      <div>
        <VoterName voter={voter} />
      </div>
      <div>
        <PartyName party={voter.party} />
      </div>
      <VoterAddress voter={voter} />
      <div>Voter ID: {voter.voterId}</div>
      <div>
        Check-In Method:{' '}
        {prettyIdentificationMethod(checkIn.identificationMethod)}
      </div>
    </StyledReceipt>
  );
}
