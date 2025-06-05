import { assert } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { Voter } from '../types';
import {
  StyledReceipt,
  VoterName,
  PartyName,
  ReceiptMetadataProps,
  ReceiptMetadata,
  ReceiptIcon,
} from './receipt_helpers';
import { getCurrentTime } from '../get_current_time';

export function MarkInactiveReceipt({
  voter,
  ...metadata
}: {
  voter: Voter;
  machineId: string;
} & ReceiptMetadataProps): JSX.Element {
  const { isInactive } = voter;
  assert(isInactive);

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
            <strong>Voter Marked as Inactive</strong>
          </div>
          <div>
            {format.localeNumericDateAndTime(new Date(getCurrentTime()))}
          </div>
        </div>

        <ReceiptIcon icon={'Disabled'} />
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
      <div>Voter ID: {voter.voterId}</div>

      <ReceiptMetadata {...metadata} />
    </StyledReceipt>
  );
}
