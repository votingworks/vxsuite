import { safeParseNumber } from '@votingworks/types';
import { CandidateGridElement } from './types';

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
 * Finds all candidates and arranges them in a LCM grid.
 */
export function readGridFromElectionDefinition(
  root: Element
): CandidateGridElement[] {
  return Array.from(root.getElementsByTagName('CandidateName')).map(
    (candidateElement) => {
      const ox = safeParseNumber(
        candidateElement.getElementsByTagName('OX')[0]?.textContent
      ).unsafeUnwrap();
      const oy = safeParseNumber(
        candidateElement.getElementsByTagName('OY')[0]?.textContent
      ).unsafeUnwrap();
      const { column, row } = timingMarkCoordinatesFromOxOy(ox, oy);
      return { element: candidateElement, column, row };
    }
  );
}
