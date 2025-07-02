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
  ...metadata
}: {
  voter: Voter;
  reason: string;
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
        </div>

        <ReceiptIcon icon="Delete" />
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
      <VoterAddress voter={voter} election={metadata.election} />
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
      <div>Poll Book: {checkIn.machineId}</div>
      <div>Receipt Number: {checkIn.receiptNumber}</div>
      <IdentificationMethod checkIn={checkIn} />

      <ReceiptMetadata {...metadata} />
    </StyledReceipt>
  );
}
