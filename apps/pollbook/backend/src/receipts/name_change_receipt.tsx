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

export function NameChangeReceipt({
  voter,
  machineId,
  ...metadata
}: {
  voter: Voter;
  machineId: string;
} & ReceiptMetadataProps): JSX.Element {
  const { nameChange } = voter;
  assert(nameChange);

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
            <strong>Voter Name Update</strong>
          </div>
          <div>
            {format.localeNumericDateAndTime(new Date(nameChange.timestamp))}
          </div>
          <div>Pollbook: {machineId}</div>
        </div>

        <ReceiptIcon icon="Edit" />
      </div>
      <br />
      <div>
        <strong>Updated Voter</strong>
        <div>
          <VoterName voter={voter} />
        </div>
        <div>
          <PartyName party={voter.party} />
        </div>
        <div>Voter ID: {voter.voterId}</div>
      </div>
      <br />
      <div>
        <strong>Previous Name</strong>
        <div>
          <VoterName voter={{ ...voter, nameChange: undefined }} />
        </div>
      </div>

      <ReceiptMetadata {...metadata} />
    </StyledReceipt>
  );
}
