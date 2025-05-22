import { assert } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { Voter } from '../types';
import {
  VoterAddress,
  StyledReceipt,
  VoterName,
  PartyName,
  IdentificationMethod,
  ReceiptMetadataProps,
  ReceiptMetadata,
  ReceiptIcon,
} from './receipt_helpers';

export function CheckInReceipt({
  voter,
  ...metadata
}: {
  voter: Voter;
  machineId: string;
} & ReceiptMetadataProps): JSX.Element {
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
            <strong>
              {checkIn.isAbsentee
                ? 'Absentee Voter Check-In'
                : 'Voter Check-In'}
            </strong>
          </div>
          <div>
            {format.localeNumericDateAndTime(new Date(checkIn.timestamp))}
          </div>
        </div>

        <ReceiptIcon icon={checkIn.isAbsentee ? 'Envelope' : 'Done'} />
      </div>

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
      <IdentificationMethod checkIn={checkIn} />

      <ReceiptMetadata {...metadata} />
    </StyledReceipt>
  );
}
