import {
  typedAs,
  throwIllegalValue,
  find,
  groupBy,
  uniqueDeep,
} from '@votingworks/basics';
import { ContestId, OrderedCandidateOption } from '@votingworks/types';
import { CandidateOrdering, RotationParams } from './types';
import { getCandidateOrderingSetsForNhBallot } from './ballot_templates/nh_ballot_template';
import { BallotTemplateId } from './ballot_templates';

/**
 * Helper function that orders candidates alphabetically by name,
 * rotating the alphabet so that it starts with the first letter of the precinct name.
 * For example, if the precinct is "Central", candidates starting with C come first,
 * then D, E, ..., Z, A, B.
 *
 * This rotation logic is only intended for demonstration purposes and testing.
 */
export function getCandidateOrderingByPrecinctAlphabetical({
  contests,
  precincts,
  precinctsOrSplitIds,
}: RotationParams): CandidateOrdering[] {
  // Generate a separate ordering for each precinct/split
  return precinctsOrSplitIds.map((precinctOrSplit) => {
    const precinct = find(
      precincts,
      (p) => p.id === precinctOrSplit.precinctId
    );
    const precinctName = precinct.name;
    const firstLetter = precinctName.charAt(0).toUpperCase();

    const orderedCandidatesByContest: Record<
      ContestId,
      OrderedCandidateOption[]
    > = {};

    for (const contest of contests) {
      switch (contest.type) {
        case 'yesno':
          // do nothing
          break;
        case 'candidate': {
          // Sort candidates by name, rotated by precinct's first letter
          let sortedCandidates = [...contest.candidates].sort((a, b) =>
            a.name.localeCompare(b.name)
          );

          // rotate so candidates starting with letters at or after the precinct letter come first
          const startIndex = sortedCandidates.findIndex(
            (c) => (c.name.charAt(0) || '').toUpperCase() >= firstLetter
          );

          if (startIndex > 0) {
            sortedCandidates = [
              ...sortedCandidates.slice(startIndex),
              ...sortedCandidates.slice(0, startIndex),
            ];
          }

          orderedCandidatesByContest[contest.id] = sortedCandidates.map(
            (candidate) =>
              typedAs<OrderedCandidateOption>({
                id: candidate.id,
              })
          );
          break;
        }
        default: {
          /* istanbul ignore next - @preserve */
          return throwIllegalValue(contest, 'type');
        }
      }
    }

    return {
      precinctsOrSplits: [precinctOrSplit],
      orderedCandidatesByContest,
    };
  });
}

/**
 * Generates ordered contests for VxDefault ballot template.
 * This template does not apply any rotation.
 * Returns a single set with the contests in their original order.
 */
function getDefaultCandidateOrdering({
  contests,
  precinctsOrSplitIds,
}: RotationParams): CandidateOrdering[] {
  const orderedCandidatesByContest: Record<
    ContestId,
    OrderedCandidateOption[]
  > = {};

  for (const contest of contests) {
    switch (contest.type) {
      case 'candidate':
        orderedCandidatesByContest[contest.id] = contest.candidates.map(
          (candidate) =>
            typedAs<OrderedCandidateOption>({
              id: candidate.id,
            })
        );
        break;
      case 'yesno':
        // do nothing
        break;
      default: {
        /* istanbul ignore next - @preserve */
        return throwIllegalValue(contest, 'type');
      }
    }
  }

  // Return a single rotation for all precincts/splits
  return [
    {
      precinctsOrSplits: [...precinctsOrSplitIds],
      orderedCandidatesByContest,
    },
  ];
}

/**
 * Given an array of CandidateOrderings, deduplicate any that have identical orderings, combining the precincts/splits that use them.
 */
export function deduplicateIdenticalOrderingsAcrossPrecincts(
  orderings: CandidateOrdering[]
): CandidateOrdering[] {
  // Group all matching CandidateOrderings by their orderedCandidatesByContest field
  const grouped = groupBy(
    orderings,
    (ordering) => ordering.orderedCandidatesByContest
  );

  // Consolidate each group into a single CandidateOrdering with deduplicated precincts/splits
  return grouped.map(([orderedCandidatesByContest, group]) => ({
    orderedCandidatesByContest,
    precinctsOrSplits: uniqueDeep(
      group.flatMap((ordering) => ordering.precinctsOrSplits)
    ),
  }));
}

// Helper function to get all contest rotations based on the selected ballot template
export function getAllPossibleCandidateOrderings(
  ballotStyleTemplateId: BallotTemplateId,
  params: RotationParams
): CandidateOrdering[] {
  let orderings: CandidateOrdering[] = [];
  switch (ballotStyleTemplateId) {
    case 'NhBallot':
      orderings = getCandidateOrderingSetsForNhBallot(params);
      break;
    case 'VxDefaultBallot':
      orderings = getDefaultCandidateOrdering(params);
      break;
    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(ballotStyleTemplateId);
    }
  }

  return deduplicateIdenticalOrderingsAcrossPrecincts(orderings);
}
