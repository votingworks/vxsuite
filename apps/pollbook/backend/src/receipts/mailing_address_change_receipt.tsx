import { format } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import {
  PartyName,
  ReceiptIcon,
  ReceiptMetadata,
  ReceiptMetadataProps,
  StyledReceipt,
  VoterMailingAddress,
  VoterName,
} from './receipt_helpers';
import { Voter } from '../types';

export function MailingAddressChangeReceipt({
  voter,
  ...metadata
}: {
  voter: Voter;
  machineId: string;
} & ReceiptMetadataProps): JSX.Element {
  const { mailingAddressChange } = voter;
  assert(mailingAddressChange);

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
            <strong>Voter Mailing Address Update</strong>
          </div>
          <div>
            {format.localeNumericDateAndTime(
              new Date(mailingAddressChange.timestamp)
            )}
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
        <strong>Previous Mailing Address</strong>
        <VoterMailingAddress
          voter={{ ...voter, mailingAddressChange: undefined }}
        />
      </div>
      <br />
      <div>
        <strong>Updated Mailing Address</strong>
        <VoterMailingAddress voter={voter} />
      </div>

      <ReceiptMetadata {...metadata} />
    </StyledReceipt>
  );
}
