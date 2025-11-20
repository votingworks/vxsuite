import type {
  Election,
  BallotStyleId,
  Id,
  PrecinctId,
  LanguageCode,
} from '@votingworks/types';

import { assert, find, throwIllegalValue } from '@votingworks/basics';
import { getAllPrecinctsAndSplits } from '@votingworks/types';
import { getBallotStyleGroupsForPrecinctOrSplit } from '@votingworks/utils';

interface FindBallotStyleArgs {
  precinctId: PrecinctId;
  splitId?: Id;
  languageCode: LanguageCode;
  partyId?: Id;
}

export function findBallotStyleId(
  election: Election,
  { precinctId, splitId, languageCode, partyId }: FindBallotStyleArgs
): BallotStyleId {
  const selectedPrecinctOrSplitId = splitId ?? precinctId;
  const allPrecinctsOrSplits = getAllPrecinctsAndSplits(election);
  const precinctOrSplit = find(
    allPrecinctsOrSplits,
    (ps) =>
      ps.split?.id === selectedPrecinctOrSplitId ||
      ps.precinct.id === selectedPrecinctOrSplitId
  );
  assert(
    precinctOrSplit,
    `No precinct or split with id ${selectedPrecinctOrSplitId} found`
  );

  const ballotStyleGroups = getBallotStyleGroupsForPrecinctOrSplit({
    election,
    precinctOrSplit,
  });

  switch (election.type) {
    case 'general': {
      assert(
        ballotStyleGroups.length === 1,
        'General elections should have exactly one ballot style group per precinct or split'
      );
      const ballotStyle = ballotStyleGroups[0].ballotStyles.find(
        (bs) => bs.languages?.includes(languageCode)
      );
      assert(ballotStyle, `No ballot style found for language ${languageCode}`);
      return ballotStyle.id;
    }
    case 'primary': {
      assert(
        partyId !== undefined,
        'partyId is required for primary elections'
      );
      const ballotStyleGroup = ballotStyleGroups.find(
        (bsg) => bsg.partyId === partyId
      );
      assert(
        ballotStyleGroup,
        `No ballot style group found for party ${partyId}`
      );
      const ballotStyle = ballotStyleGroup.ballotStyles.find(
        (bs) => bs.languages?.includes(languageCode)
      );
      assert(ballotStyle, `No ballot style found for language ${languageCode}`);
      return ballotStyle.id;
    }
    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(election.type);
    }
  }
}
