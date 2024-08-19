import * as accuvote from './accuvote';

const ElectionDefinitionVerticalTimingMarkDistance = 9;
const ElectionDefinitionHorizontalTimingMarkDistance = 108 / 7;
const ElectionDefinitionOriginX =
  236.126 - ElectionDefinitionHorizontalTimingMarkDistance * 12;
const ElectionDefinitionOriginY =
  245.768 - ElectionDefinitionVerticalTimingMarkDistance * 9;

function timingMarkCoordinatesFromOxOy(
  ox: number,
  oy: number
): { column: number; row: number } {
  return {
    column: Math.round(
      (ox - ElectionDefinitionOriginX) /
        ElectionDefinitionHorizontalTimingMarkDistance
    ),
    row: Math.round(
      (oy - ElectionDefinitionOriginY) /
        ElectionDefinitionVerticalTimingMarkDistance
    ),
  };
}

/**
 * Contains candidate elements and their LCM column/row coordinates.
 */
export interface CandidateGridEntry {
  readonly office: accuvote.OfficeName;
  readonly candidate: accuvote.CandidateName;
  readonly column: number;
  readonly row: number;
}

/**
 * Finds all candidates and arranges them in a LCM grid.
 */
export function readGridFromElectionDefinition(
  avsInterface: accuvote.AvsInterface
): CandidateGridEntry[] {
  return avsInterface.candidates.flatMap((candidateContest) =>
    candidateContest.candidateNames.map((candidate) => {
      const { column, row } = timingMarkCoordinatesFromOxOy(
        candidate.ox,
        candidate.oy
      );
      return { office: candidateContest.officeName, candidate, column, row };
    })
  );
}
