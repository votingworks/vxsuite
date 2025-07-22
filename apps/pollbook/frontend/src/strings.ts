import { throwIllegalValue } from '@votingworks/basics';
import type {
  CheckInBallotParty,
  PartyAbbreviation,
} from '@votingworks/pollbook-backend';

export function partyAbbreviationToString(
  party: CheckInBallotParty | PartyAbbreviation
): string {
  switch (party) {
    case 'DEM':
      return 'Democratic';
    case 'REP':
      return 'Republican';
    case 'UND':
      /* istanbul ignore next - @preserve */
      return 'Undeclared';
    case 'NOT_APPLICABLE':
      return 'Not Applicable';
    default:
      /* istanbul ignore next - @preserve */
      throwIllegalValue(party);
  }
}
