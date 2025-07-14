import { throwIllegalValue } from '@votingworks/basics';
import type { PartyAbbreviation } from '@votingworks/pollbook-backend';

export function partyAbbreviationToString(party: PartyAbbreviation): string {
  switch (party) {
    case 'DEM':
      return 'Democratic';
    case 'REP':
      return 'Republican';
    case 'UND':
      /* istanbul ignore next - @preserve */
      return 'Undeclared';
    default:
      /* istanbul ignore next - @preserve */
      throwIllegalValue(party);
  }
}
