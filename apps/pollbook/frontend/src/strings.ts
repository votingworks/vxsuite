import { throwIllegalValue } from '@votingworks/basics';
import type { CheckInBallotParty, PartyAbbreviation } from '@votingworks/types';

export function partyAbbreviationToString(
  party: CheckInBallotParty | PartyAbbreviation
): string {
  switch (party) {
    case 'DEM':
      return 'Democratic';
    case 'REP':
      return 'Republican';
    case 'UND':
      return 'Undeclared';
    case 'NOT_APPLICABLE':
      return 'Not Applicable';
    default:
      throwIllegalValue(party);
  }
}
