import { format } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import {
  PartyName,
  ReceiptIcon,
  ReceiptMetadata,
  ReceiptMetadataProps,
  StyledReceipt,
  VoterAddress,
  VoterName,
} from './receipt_helpers';
import { Voter } from '../types';

export function AddressChangeReceipt({
  voter,
  ...metadata
}: {
  voter: Voter;
  machineId: string;
} & ReceiptMetadataProps): JSX.Element {
  const { addressChange } = voter;
  assert(addressChange);

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
            <strong>Voter Address Update</strong>
          </div>
          <div>
            {format.localeNumericDateAndTime(new Date(addressChange.timestamp))}
          </div>
        </div>

        <ReceiptIcon icon="Edit" />
      </div>
      <div>
        <strong>Voter</strong>
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
        <strong>Previous Address</strong>
        <VoterAddress
          voter={{ ...voter, addressChange: undefined }}
          election={metadata.election}
        />
      </div>
      <br />
      <div>
        <strong>Updated Address</strong>
        <VoterAddress voter={voter} election={metadata.election} />
      </div>

      <ReceiptMetadata {...metadata} />
    </StyledReceipt>
  );
}
