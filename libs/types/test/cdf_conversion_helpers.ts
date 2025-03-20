import { mapObject } from '@votingworks/basics';
import { Election } from '../src/election';
import { ElectionStringKey } from '../src/ui_string_translations';

export function normalizeVxfAfterCdfConversion(
  vxfElection: Election
): Election {
  return {
    ...vxfElection,
    // CDF only has one field for party name, so we lose `party.name`
    parties: vxfElection.parties.map((party) => ({
      ...party,
      name: party.fullName,
    })),
    ballotStrings: mapObject(vxfElection.ballotStrings, (strings) => ({
      ...strings,
      [ElectionStringKey.PARTY_NAME]:
        strings[ElectionStringKey.PARTY_FULL_NAME],
    })),
    // No field in CDF for seal
    seal: '',
  };
}
