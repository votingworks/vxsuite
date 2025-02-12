import { assert, throwIllegalValue } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { Icons } from '@votingworks/ui';
import { Voter } from './types';
import { VoterAddress, StyledReceipt } from './receipt_helpers';

function formatPartyName(party: 'DEM' | 'REP' | 'UND'): string {
  switch (party) {
    case 'DEM':
      return 'Democrat';
    case 'REP':
      return 'Republican';
    case 'UND':
      return 'Undecided';
    default:
      throwIllegalValue(party);
  }
}

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
            <strong>Voter Registered</strong>
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
        {registrationEvent.firstName} {registrationEvent.suffix}{' '}
        {registrationEvent.middleName} {registrationEvent.lastName}
      </div>
      <VoterAddress voter={voter} />
      <div>Party: {formatPartyName(registrationEvent.party)}</div>
    </StyledReceipt>
  );
}
