import { assert } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { H3 } from '@votingworks/ui';
import { Voter } from '@votingworks/types';
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

export function CheckInReceipt({
  voter,
  reprintTimestamp,
  ...metadata
}: {
  voter: Voter;
  machineId: string;
  reprintTimestamp?: Date;
} & ReceiptMetadataProps): JSX.Element {
  const { checkIn } = voter;
  assert(checkIn);

  return (
    <StyledReceipt>
      {reprintTimestamp !== undefined && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '1rem',
            margin: '0.5rem 0',
            paddingTop: '0.25rem',
            borderWidth: '1px 0',
            borderStyle: 'solid',
            borderColor: 'black',
          }}
        >
          <H3>REPRINTED</H3>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div>
          <div>
            <strong>
              {checkIn.isAbsentee
                ? 'Absentee Voter Check-In'
                : 'Voter Check-In'}
            </strong>
          </div>
          <div>
            {format.localeNumericDateAndTime(new Date(checkIn.timestamp))}
          </div>
        </div>

        <ReceiptIcon icon={checkIn.isAbsentee ? 'Envelope' : 'Done'} />
      </div>
      <div>
        <strong>Voter</strong>
      </div>
      <div>
        <VoterName voter={voter} />
      </div>
      <div>
        <PartyName
          party={
            voter.checkIn?.ballotParty === 'DEM' ||
            voter.checkIn?.ballotParty === 'REP'
              ? voter.checkIn.ballotParty
              : voter.party
          }
        />
      </div>
      <VoterAddress voter={voter} election={metadata.election} />
      <div>Voter ID: {voter.voterId}</div>
      <IdentificationMethod checkIn={checkIn} />

      {reprintTimestamp !== undefined && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: '0.5rem',
            paddingTop: '0.25rem',
            borderTop: '1px solid black',
          }}
        >
          <H3
            style={{
              margin: 0,
              padding: 0,
            }}
          >
            REPRINTED
          </H3>
          <div
            style={{
              margin: 0,
              padding: 0,
            }}
          >
            {format.localeNumericDateAndTime(reprintTimestamp)}
          </div>
        </div>
      )}
      <ReceiptMetadata {...metadata} />
    </StyledReceipt>
  );
}
