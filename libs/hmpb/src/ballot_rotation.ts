import { typedAs, throwIllegalValue, find } from '@votingworks/basics';
import {
  ContestId,
  DisplayCandidate,
  PrecinctOrSplitId,
} from '@votingworks/types';
import { CandidateOrderingSet, RotationParams } from './types';
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
  districtIds,
}: RotationParams): CandidateOrderingSet[] {
  const ballotStyleContests = contests.filter((contest) =>
    districtIds.includes(contest.districtId)
  );

  // Generate a separate ordering for each precinct/split
  return precinctsOrSplitIds.map((precinctOrSplit) => {
    const precinct = find(
      precincts,
      (p) => p.id === precinctOrSplit.precinctId
    );
    const precinctName = precinct.name;
    const firstLetter = precinctName.charAt(0).toUpperCase();

    const orderedContests: Record<ContestId, DisplayCandidate[]> = {};

    for (const contest of ballotStyleContests) {
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

          orderedContests[contest.id] = sortedCandidates.map((candidate) =>
            typedAs<DisplayCandidate>({
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
      orderedContests,
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
  districtIds,
}: RotationParams): CandidateOrderingSet[] {
  // Get contests for this ballot style (filtered by district)
  const ballotStyleContests = contests.filter((contest) =>
    districtIds.includes(contest.districtId)
  );

  const orderedContests: Record<ContestId, DisplayCandidate[]> = {};

  for (const contest of ballotStyleContests) {
    switch (contest.type) {
      case 'candidate':
        orderedContests[contest.id] = contest.candidates.map((candidate) =>
          typedAs<DisplayCandidate>({
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
      orderedContests,
    },
  ];
}

/**
 * Given an array of CandidateOrderingSets, deduplicate any that have identical orderings, combining the precincts/splits that use them.
 */
export function deduplicateIdenticalOrderingsAcrossPrecincts(
  orderings: CandidateOrderingSet[]
): CandidateOrderingSet[] {
  const groupedByKey = new Map<string, CandidateOrderingSet[]>();

  // Group all matching CandidateOrderingSets by a key derived from orderedContests
  for (const ordering of orderings) {
    const key = JSON.stringify(ordering.orderedContests);
    const group = groupedByKey.get(key);
    if (group) group.push(ordering);
    else groupedByKey.set(key, [ordering]);
  }

  // Consolidate each group into a single CandidateOrderingSet with deduplicated precincts/splits
  const deduped: CandidateOrderingSet[] = [];
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
export function getAllPossibleCandidateOrderings(
  ballotStyleTemplateId: BallotTemplateId,
  params: RotationParams
): CandidateOrderingSet[] {
  let orderings: CandidateOrderingSet[] = [];
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
