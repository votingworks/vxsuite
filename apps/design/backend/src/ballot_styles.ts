import {
  groupBy,
  throwIllegalValue,
  unique,
  typedAs,
} from '@votingworks/basics';
import {
  BallotLanguageConfigs,
  CandidateContest,
  ContestOrderingSet,
  Contests,
  DistrictId,
  Election,
  ElectionType,
  OrderedCandidateContest,
  OrderedYesNoContest,
  Parties,
  Precinct,
  PrecinctOrSplitId,
  RotationParams,
  hasSplits,
} from '@votingworks/types';
import {
  generateBallotStyleGroupId,
  generateBallotStyleId,
} from '@votingworks/utils';

import {
  BallotTemplateId,
  getAllOrderedContestSetsForNhBallot,
} from '@votingworks/hmpb';
import { BallotStyle } from './types';

/**
 * Generates ordered contests for VxDefault ballot template.
 * This template does not apply any rotation.
 * Returns a single set with the contests in their original order.
 */
function getOrderedContestsWithoutRotation({
  election,
  precinctsOrSplits,
  districtIds,
}: RotationParams): ContestOrderingSet[] {
  // Get contests for this ballot style (filtered by district)
  const ballotStyleContests = election.contests.filter((contest) =>
    districtIds.includes(contest.districtId)
  );

  // VxDefault ballot does not apply rotation, just preserve the order
  const orderedContests = ballotStyleContests.map((contest) => {
    switch (contest.type) {
      case 'candidate':
        return typedAs<OrderedCandidateContest>({
          contestId: contest.id,
          type: contest.type,
          // No rotation, candidates in their original order
          orderedCandidateIds: contest.candidates.map((c) => c.id),
        });
      case 'yesno':
        return typedAs<OrderedYesNoContest>({
          contestId: contest.id,
          type: contest.type,
        });
      default:
        return throwIllegalValue(contest, 'type');
    }
  });

  // Return a single rotation for all precincts/splits
  return [
    {
      precinctsOrSplits,
      orderedContests,
    },
  ];
}

/**
 * Given an array of ContestOrderingSets, deduplicate any that have identical orderings, combining the precincts/splits that use them.
 */
function deduplicateIdenticalOrderingsAcrossPrecincts(
  orderings: ContestOrderingSet[]
): ContestOrderingSet[] {
  const groupedByKey = new Map<string, ContestOrderingSet[]>();

  // Group all matching ContestOrderingSets by a key derived from orderedContests
  for (const ordering of orderings) {
    const key = JSON.stringify(ordering.orderedContests);
    const group = groupedByKey.get(key);
    if (group) group.push(ordering);
    else groupedByKey.set(key, [ordering]);
  }

  // Consolidate each group into a single ContestOrderingSet with deduplicated precincts/splits
  const deduped: ContestOrderingSet[] = [];
  for (const [, group] of groupedByKey.entries()) {
    const { orderedContests } = group[0];
    const seen = new Set<string>();
    const precinctsOrSplits: PrecinctOrSplitId[] = [];

    for (const { precinctsOrSplits: precinctList } of group) {
      for (const p of precinctList) {
        const pk = `${p.precinctId}|${p.splitId ?? ''}`;
        if (!seen.has(pk)) {
          seen.add(pk);
          precinctsOrSplits.push(p);
        }
      }
    }

    deduped.push({
      orderedContests,
      precinctsOrSplits,
    });
  }

  return deduped;
}

// Helper function to get all contest rotations based on the selected ballot template
function getAllOrderedContestSets(
  ballotStyleTemplateId: BallotTemplateId,
  params: RotationParams
): ContestOrderingSet[] {
  let orderings: ContestOrderingSet[] = [];
  switch (ballotStyleTemplateId) {
    case 'NhBallot':
      orderings = getAllOrderedContestSetsForNhBallot(params);
      break;
    case 'VxDefaultBallot':
      orderings = getOrderedContestsWithoutRotation(params);
      break;
    default:
      throwIllegalValue(ballotStyleTemplateId);
  }
  return deduplicateIdenticalOrderingsAcrossPrecincts(orderings);
}

/**
 * Generates ballot styles for the election based on geography data (districts,
 * precincts, and precinct splits), ballot languages, and the ballot template. For primary elections,
 * generates distinct ballot styles for each party. The ballot template defines
 * what rotation rules are applied. Rotation by precinct my cause more ballot styles to need to be created.
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
  election: Election;
  parties: Parties;
  precincts: Precinct[];
  ballotStyleTemplateId: BallotTemplateId;
}): BallotStyle[] {
  const {
    ballotLanguageConfigs,
    contests,
    election,
    electionType,
    parties,
    precincts,
    ballotStyleTemplateId,
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
          contests.some((contest) => contest.districtId === districtId)
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
        ([districtIds, precinctsOrSplits], index) => {
          // Get all ordered contest sets for this district group
          const orderedContestSets = getAllOrderedContestSets(
            ballotStyleTemplateId,
            {
              election,
              districtIds,
              precinctsOrSplits,
            }
          );

          // Create ballot styles for each ordered contest set and language config
          return orderedContestSets.flatMap(
            ({ orderedContests, precinctsOrSplits: precinctsForSet }) =>
              ballotLanguageConfigs.map(({ languages }) => ({
                id: generateBallotStyleId({
                  ballotStyleIndex: index + 1,
                  languages,
                }),
                group_id: generateBallotStyleGroupId({
                  ballotStyleIndex: index + 1,
                }),
                precinctsOrSplits: precinctsForSet,
                districtIds,
                languages,
                orderedContests,
              }))
          );
        }
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

          return partiesWithContests.flatMap((party) => {
            // Get all ordered contest sets for this district group
            const orderedContestSets = getAllOrderedContestSets(
              ballotStyleTemplateId,
              {
                election,
                districtIds,
                precinctsOrSplits,
              }
            );

            // Create ballot styles for each ordered contest set and language config
            return orderedContestSets.flatMap(
              ({ orderedContests, precinctsOrSplits: precinctsForSet }) =>
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
                  precinctsOrSplits: precinctsForSet,
                  districtIds,
                  partyId: party.id,
                  languages,
                  orderedContests,
                }))
            );
          });
        }
      );

    default:
      return throwIllegalValue(electionType);
  }
}
