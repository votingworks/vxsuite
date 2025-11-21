import type {
  Election,
  BallotStyleId,
  Id,
  PrecinctId,
  LanguageCode,
} from '@votingworks/types';

import {
  assert,
  assertDefined,
  find,
  throwIllegalValue,
} from '@votingworks/basics';
import { getAllPrecinctsAndSplits, hasSplits } from '@votingworks/types';
import {
  getBallotStyleGroupsForPrecinctOrSplit,
  getPrecinctsAndSplitsForBallotStyle,
} from '@votingworks/utils';
import { BallotPrintCount } from '../types';
import type { BallotPrintCountRow } from '../store';

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

export function addBallotsPropsToPrintCountRow(
  election: Election,
  printCountRow: BallotPrintCountRow
): BallotPrintCount {
  const { ballotStyleId } = printCountRow;
  const ballotStyle = election.ballotStyles.find(
    (bs) => bs.id === ballotStyleId
  );
  assert(ballotStyle, `No ballot style found with id ${ballotStyleId}`);

  const precinct = assertDefined(
    find(election.precincts, (p) => p.id === printCountRow.precinctId)
  );
  const precinctHasSplits = hasSplits(precinct);

  const precinctAndSplitsForBallotStyle = getPrecinctsAndSplitsForBallotStyle({
    election,
    ballotStyle,
  });

  const matchingPrecinctOrSplit = assertDefined(
    precinctAndSplitsForBallotStyle.find(
      (ps) =>
        ps.precinct.id === precinct.id &&
        (precinctHasSplits ? ps.split !== undefined : ps.split === undefined)
    ),
    'No matching precinct or split found for ballot style'
  );
  const precinctOrSplitName = matchingPrecinctOrSplit.split
    ? `${matchingPrecinctOrSplit.precinct.name} - ${matchingPrecinctOrSplit.split.name}`
    : matchingPrecinctOrSplit.precinct.name;

  const languageCode = assertDefined(ballotStyle.languages)[0] as LanguageCode;

  let partyName: string | undefined;
  if (election.type === 'primary') {
    assert(ballotStyle.partyId !== undefined);
    const party = election.parties.find((p) => p.id === ballotStyle.partyId);
    assert(party, `No party found with id ${ballotStyle.partyId}`);
    ({ name: partyName } = party);
  }

  return {
    ...printCountRow,
    precinctOrSplitName,
    languageCode,
    partyName,
  };
}
