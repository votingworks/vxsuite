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
import { getCurrentTime } from '../get_current_time';

export function UndoCheckInReceipt({
  voter,
  reason,
  machineId,
  ...metadata
}: {
  voter: Voter;
  reason: string;
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
            <strong>Undo Voter Check-In</strong>
          </div>
          <div>
            {format.localeNumericDateAndTime(new Date(getCurrentTime()))}
          </div>
          <div>Pollbook: {machineId}</div>
        </div>

        <ReceiptIcon icon="Delete" />
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

      <br />

      <div>
        <strong>Reason</strong>
      </div>
      <div>{reason}</div>

      <br />

      <div>
        <strong>Check-In Details</strong>
      </div>
      <div>{format.localeNumericDateAndTime(new Date(checkIn.timestamp))}</div>
      <div>Pollbook: {checkIn.machineId}</div>
      <IdentificationMethod checkIn={checkIn} />

      <ReceiptMetadata {...metadata} />
    </StyledReceipt>
  );
}
