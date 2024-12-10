import { groupBy, throwIllegalValue, unique } from '@votingworks/basics';
import {
  BallotLanguageConfigs,
  CandidateContest,
  Contests,
  DistrictId,
  ElectionType,
  Parties,
} from '@votingworks/types';
import {
  generateBallotStyleGroupId,
  generateBallotStyleId,
} from '@votingworks/utils';

import { BallotStyle, Precinct, PrecinctOrSplitId, hasSplits } from './types';

/**
 * Generates ballot styles for the election based on geography data (districts,
 * precincts, and precinct splits) and ballot languages. For primary elections,
 * generates distinct ballot styles for each party.
 *
 * Each ballot styles should have a unique set of contests. Contests are
 * specified per district. We generate ballot styles by looking at the
 * district list for each precinct/precinct split. If the district list is
 * unique, it gets its own ballot style. Otherwise, we reuse another ballot
 * style with the same district list.
 */
export function generateBallotStyles(params: {
  contests: Contests;
  ballotLanguageConfigs: BallotLanguageConfigs;
  electionType: ElectionType;
  parties: Parties;
  precincts: Precinct[];
}): BallotStyle[] {
  const { ballotLanguageConfigs, contests, electionType, parties, precincts } =
    params;

  const allPrecinctsOrSplitsWithDistricts: Array<
    PrecinctOrSplitId & { districtIds: readonly DistrictId[] }
  > = precincts
    .flatMap((precinct) => {
      if (hasSplits(precinct)) {
        return precinct.splits.map((split) => ({
          precinctId: precinct.id,
          splitId: split.id,
          districtIds: split.districtIds,
        }));
      }
      return { precinctId: precinct.id, districtIds: precinct.districtIds };
    })
    .filter(({ districtIds }) => districtIds.length > 0);

  const precinctsOrSplitsByDistricts: Array<
    [readonly DistrictId[], PrecinctOrSplitId[]]
  > = groupBy(
    allPrecinctsOrSplitsWithDistricts,
    ({ districtIds }) => districtIds
  ).map(([districtIds, group]) => [
    districtIds,
    // Remove districtIds after grouping, we don't need them anymore
    group.map(({ precinctId, splitId }) => ({ precinctId, splitId })),
  ]);

  switch (electionType) {
    case 'general':
      return precinctsOrSplitsByDistricts.flatMap(
        ([districtIds, precinctsOrSplits], index) =>
          ballotLanguageConfigs.map(({ languages }) => ({
            id: generateBallotStyleId({
              ballotStyleIndex: index + 1,
              languages,
            }),
            group_id: generateBallotStyleGroupId({
              ballotStyleIndex: index + 1,
            }),
            precinctsOrSplits,
            districtIds,
            languages,
          }))
      );

    case 'primary':
      return precinctsOrSplitsByDistricts.flatMap(
        ([districtIds, precinctsOrSplits], index) => {
          const partyIds = unique(
            contests
              .filter(
                (contest): contest is CandidateContest =>
                  contest.type === 'candidate' &&
                  contest.partyId !== undefined &&
                  districtIds.includes(contest.districtId)
              )
              .map((contest) => contest.partyId)
          );
          const partiesWithContests = parties.filter((party) =>
            partyIds.includes(party.id)
          );
          return partiesWithContests.flatMap((party) =>
            ballotLanguageConfigs.map(({ languages }) => ({
              id: generateBallotStyleId({
                ballotStyleIndex: index + 1,
                languages,
                party,
              }),
              group_id: generateBallotStyleGroupId({
                ballotStyleIndex: index + 1,
                party,
              }),
              precinctsOrSplits,
              districtIds,
              partyId: party.id,
              languages,
            }))
          );
        }
      );

    default:
      return throwIllegalValue(electionType);
  }
}
