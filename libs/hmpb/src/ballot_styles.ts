import { groupBy, throwIllegalValue, unique } from '@votingworks/basics';
import {
  BallotLanguageConfigs,
  CandidateContest,
  Contests,
  DistrictId,
  ElectionType,
  Parties,
  PrecinctOrSplitId,
  Precinct,
  hasSplits,
  BallotStyle,
  ElectionId,
} from '@votingworks/types';
import {
  generateBallotStyleGroupId,
  generateBallotStyleId,
} from '@votingworks/utils';
import { BallotTemplateId } from './ballot_templates';
import { getAllPossibleCandidateOrderings } from './ballot_rotation';

/**
 * Generates ballot styles for the election based on geography data (districts,
 * precincts, and precinct splits), ballot languages, and the ballot template. For primary elections,
 * generates distinct ballot styles for each party. The ballot template defines
 * what rotation rules are applied. Rotation by precinct may cause more ballot styles to need to be created.
 *
 * Each ballot styles should have a unique set of contests or uniquely rotated version of contests.
 * Contests are specified per district. We generate ballot styles by looking at the
 * district list for each precinct/precinct split. If the district list is
 * unique, it gets its own ballot style. Otherwise, we reuse another ballot
 * style with the same district list. Then we apply rotation rules, if they will result in a unique rotation
 * for a given precinct/split and set of contests it will get its own ballot style.
 */
export function generateBallotStyles(params: {
  contests: Contests;
  ballotLanguageConfigs: BallotLanguageConfigs;
  electionType: ElectionType;
  parties: Parties;
  precincts: Precinct[];
  ballotTemplateId: BallotTemplateId;
  electionId: ElectionId;
}): BallotStyle[] {
  const {
    ballotLanguageConfigs,
    contests,
    electionType,
    parties,
    precincts,
    ballotTemplateId,
    electionId,
  } = params;

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
    .filter(
      ({ districtIds }) =>
        districtIds.length > 0 &&
        // Don't create ballot styles for precincts/splits with no contests assigned
        districtIds.some((districtId) =>
          contests.some(
            (contest) =>
              contest.type !== 'straight-party' &&
              contest.districtId === districtId
          )
        )
    );

  const precinctsOrSplitsByDistricts: Array<
    [readonly DistrictId[], PrecinctOrSplitId[]]
  > = groupBy(allPrecinctsOrSplitsWithDistricts, ({ districtIds }) =>
    districtIds.toSorted()
  ).map(([districtIds, group]) => [
    districtIds,
    // Remove districtIds after grouping, we don't need them anymore
    group.map(({ precinctId, splitId }) => ({ precinctId, splitId })),
  ]);

  switch (electionType) {
    case 'general':
      return precinctsOrSplitsByDistricts.flatMap(
        ([districtIds, precinctsOrSplitIds], ballotStyleIndex) => {
          // Filter contests by district before generating orderings
          const ballotStyleContests = contests.filter((contest) =>
            districtIds.includes(contest.districtId)
          );
          // Get all ordered contest sets for this district group
          const orderedContestSets = getAllPossibleCandidateOrderings(
            ballotTemplateId,
            {
              contests: ballotStyleContests,
              precincts,
              districtIds,
              precinctsOrSplitIds,
              electionId,
            }
          );
          // Create ballot styles for each ordered contest set and language config
          return orderedContestSets.flatMap(
            (
              {
                orderedCandidatesByContest: orderedContests,
                precinctsOrSplits: precinctsForSet,
              },
              rotationIndex
            ) =>
              ballotLanguageConfigs.map(({ languages }) => ({
                id: generateBallotStyleId({
                  ballotStyleIndex: ballotStyleIndex + 1,
                  rotationIndex:
                    orderedContestSets.length > 1
                      ? rotationIndex + 1
                      : undefined,
                  languages,
                }),
                groupId: generateBallotStyleGroupId({
                  ballotStyleIndex: ballotStyleIndex + 1,
                  rotationIndex:
                    orderedContestSets.length > 1
                      ? rotationIndex + 1
                      : undefined,
                }),
                precincts: precinctsForSet.map(({ precinctId }) => precinctId),
                districts: districtIds,
                languages,
                orderedCandidatesByContest: orderedContests,
              }))
          );
        }
      );

    case 'primary':
      return precinctsOrSplitsByDistricts.flatMap(
        ([districtIds, precinctsOrSplitIds], ballotStyleIndex) => {
          // Filter contests by district before generating orderings
          const ballotStyleContests = contests.filter((contest) =>
            districtIds.includes(contest.districtId)
          );
          const partyIds = unique(
            ballotStyleContests
              .filter(
                (contest): contest is CandidateContest =>
                  contest.type === 'candidate' && contest.partyId !== undefined
              )
              .map((contest) => contest.partyId)
          );
          const orderedContestSets = getAllPossibleCandidateOrderings(
            ballotTemplateId,
            {
              contests: ballotStyleContests,
              precincts,
              districtIds,
              precinctsOrSplitIds,
              electionId,
            }
          );
          const partiesWithContests = parties.filter((party) =>
            partyIds.includes(party.id)
          );
          return orderedContestSets.flatMap(
            (
              {
                orderedCandidatesByContest: orderedContests,
                precinctsOrSplits: precinctsForSet,
              },
              rotationIndex
            ) =>
              partiesWithContests.flatMap((party) =>
                ballotLanguageConfigs.map(({ languages }) => ({
                  id: generateBallotStyleId({
                    ballotStyleIndex: ballotStyleIndex + 1,
                    rotationIndex:
                      orderedContestSets.length > 1
                        ? rotationIndex + 1
                        : undefined,
                    languages,
                    party,
                  }),
                  groupId: generateBallotStyleGroupId({
                    ballotStyleIndex: ballotStyleIndex + 1,
                    rotationIndex:
                      orderedContestSets.length > 1
                        ? rotationIndex + 1
                        : undefined,
                    party,
                  }),
                  precincts: precinctsForSet.map(
                    ({ precinctId }) => precinctId
                  ),
                  districts: districtIds,
                  partyId: party.id,
                  languages,
                  orderedCandidatesByContest: orderedContests,
                }))
              )
          );
        }
      );

    default: {
      /* istanbul ignore next - @preserve */
      return throwIllegalValue(electionType);
    }
  }
}
