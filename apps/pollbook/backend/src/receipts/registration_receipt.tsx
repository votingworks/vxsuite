import { assert } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { Voter } from '../types';
import {
  VoterAddress,
  StyledReceipt,
  VoterName,
  PartyName,
  ReceiptMetadataProps,
  ReceiptMetadata,
  ReceiptIcon,
} from './receipt_helpers';

export function RegistrationReceipt({
  voter,
  ...metadata
}: {
  voter: Voter;
} & ReceiptMetadataProps): JSX.Element {
  const { registrationEvent } = voter;
  assert(registrationEvent);

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
            <strong>Add Voter</strong>
          </div>
          <div>
            {format.localeNumericDateAndTime(
              new Date(registrationEvent.timestamp)
            )}
          </div>
        </div>

        <ReceiptIcon icon="Add" />
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

      <ReceiptMetadata {...metadata} />
    </StyledReceipt>
  );
}
