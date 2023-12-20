import {
  Election,
  Party,
  PartyId,
  PrecinctId,
  District,
  CandidateVote,
  ElectionDefinition,
  Tabulation,
  YesNoVote,
} from '@votingworks/types';
import { assert, find, unique } from '@votingworks/basics';
import type {
  TallyReportResults,
  CardCountsByParty,
} from '@votingworks/admin-backend';
import {
  TestDeckBallot,
  getBallotStyleIdPartyIdLookup,
  groupMapToGroupList,
  tabulateCastVoteRecords,
  getContestsForPrecinct,
  getEmptyCardCounts,
} from '@votingworks/utils';

export function getPartiesWithPrimaryElections(election: Election): Party[] {
  const partyIds = election.ballotStyles
    .map((bs) => bs.partyId)
    .filter((id): id is PartyId => id !== undefined);
  return election.parties.filter((party) => partyIds.includes(party.id));
}

/**
 * Returns all districts that have some ballot style associated with them.
 */
export function getValidDistricts(election: Election): District[] {
  const ids = unique(election.ballotStyles.flatMap((bs) => bs.districts));
  return ids.map((id) =>
    find(election.districts, (district) => district.id === id)
  );
}

export function testDeckBallotToCastVoteRecord(
  testDeckBallot: TestDeckBallot
): Tabulation.CastVoteRecord {
  const votes: Tabulation.CastVoteRecord['votes'] = {};

  for (const [contestId, vote] of Object.entries(testDeckBallot.votes)) {
    if (vote) {
      if (typeof vote[0] === 'string') {
        // yes no vote
        const yesNoVote = vote as YesNoVote;
        votes[contestId] = [...yesNoVote];
      } else {
        // candidate vote
        const candidates = vote as CandidateVote;
        votes[contestId] = candidates.map((c) => c.id);
      }
    }
  }

  return {
    votes,
    precinctId: testDeckBallot.precinctId,
    ballotStyleId: testDeckBallot.ballotStyleId,
    votingMethod: 'precinct',
    scannerId: 'test-deck',
    batchId: 'test-deck',
    card:
      testDeckBallot.markingMethod === 'machine'
        ? { type: 'bmd' }
        : { type: 'hmpb', sheetNumber: 1 },
  };
}

export async function generateResultsFromTestDeckBallots({
  electionDefinition,
  testDeckBallots,
  precinctId,
}: {
  electionDefinition: ElectionDefinition;
  testDeckBallots: TestDeckBallot[];
  precinctId?: PrecinctId;
}): Promise<TallyReportResults> {
  const { election } = electionDefinition;
  const ballotStyleIdPartyIdLookup = getBallotStyleIdPartyIdLookup(election);

  const scannedResults = groupMapToGroupList(
    await tabulateCastVoteRecords({
      election,
      cvrs: testDeckBallots.map((testDeckBallot) => ({
        ...testDeckBallotToCastVoteRecord(testDeckBallot),
        partyId: ballotStyleIdPartyIdLookup[testDeckBallot.ballotStyleId],
      })),
    })
  )[0];
  const contestIds = getContestsForPrecinct(electionDefinition, precinctId).map(
    (c) => c.id
  );

  if (election.type === 'general') {
    return {
      scannedResults,
      contestIds,
      hasPartySplits: false,
      cardCounts: scannedResults.cardCounts,
    };
  }

  assert(election.type === 'primary');
  const cardCountsByParty: CardCountsByParty = {};
  for (const testDeckBallot of testDeckBallots) {
    const partyId = ballotStyleIdPartyIdLookup[testDeckBallot.ballotStyleId];
    const partyCardCounts = cardCountsByParty[partyId] ?? getEmptyCardCounts();
    partyCardCounts.bmd += 1;
    cardCountsByParty[partyId] = partyCardCounts;
  }

  return {
    scannedResults,
    contestIds,
    hasPartySplits: true,
    cardCountsByParty,
  };
}
