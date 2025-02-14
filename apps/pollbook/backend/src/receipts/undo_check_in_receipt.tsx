import { assert } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { Icons } from '@votingworks/ui';
import { Voter } from '../types';
import {
  VoterAddress,
  StyledReceipt,
  VoterName,
  PartyName,
  IdentificationMethod,
} from './receipt_helpers';

export function UndoCheckInReceipt({
  voter,
  machineId,
}: {
  voter: Voter;
  machineId: string;
}): JSX.Element {
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
            <strong>Undo Check-In</strong>
          </div>
          <div>{format.localeNumericDateAndTime(new Date())}</div>
          <div>Pollbook: {machineId}</div>
        </div>

        <Icons.Delete style={{ fontSize: '3rem' }} />
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
        <strong>Check-In Details</strong>
      </div>
      <div>{format.localeNumericDateAndTime(new Date(checkIn.timestamp))}</div>
      <div>Pollbook: {checkIn.machineId}</div>
      <div>
        Check-In Method: <IdentificationMethod checkIn={checkIn} />
      </div>
    </StyledReceipt>
  );
}
