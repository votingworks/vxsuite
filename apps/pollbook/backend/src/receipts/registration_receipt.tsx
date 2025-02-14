import { assert, throwIllegalValue } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { Icons } from '@votingworks/ui';
import { Voter } from '../types';
import {
  VoterAddress,
  StyledReceipt,
  VoterName,
  PartyName,
} from './receipt_helpers';

export function RegistrationReceipt({
  voter,
  machineId,
}: {
  voter: Voter;
  machineId: string;
}): JSX.Element {
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
            <strong>Voter Added</strong>
          </div>
          <div>
            {format.localeNumericDateAndTime(
              new Date(registrationEvent.timestamp)
            )}
          </div>
          <div>Pollbook: {machineId}</div>
        </div>

        <Icons.Add style={{ fontSize: '3rem' }} />
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
    </StyledReceipt>
  );
}
