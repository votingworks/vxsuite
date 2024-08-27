import * as accuvote from '../../accuvote';

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
  type: 'candidate';
  office: accuvote.OfficeName;
  candidate: accuvote.CandidateName;
  column: number;
  row: number;
}

/**
 * Contains yes/no elements and their LCM column/row coordinates.
 */
export interface YesNoOptionGridEntry {
  type: 'yesno';
  question: accuvote.YesNoQuestion;
  option: 'yes' | 'no';
  column: number;
  row: number;
}

/**
 * Any of the grid entry types.
 */
export type AnyGridEntry = CandidateGridEntry | YesNoOptionGridEntry;

/**
 * Reads all grid entries from the election definition.
 */
export function readGridFromElectionDefinition(
  avsInterface: accuvote.AvsInterface
): AnyGridEntry[] {
  return [
    ...avsInterface.candidates.flatMap((candidateContest) =>
      candidateContest.candidateNames.map(
        (candidate): CandidateGridEntry => ({
          type: 'candidate',
          office: candidateContest.officeName,
          candidate,
          ...timingMarkCoordinatesFromOxOy(candidate.ox, candidate.oy),
        })
      )
    ),
    ...avsInterface.yesNoQuestions.flatMap(
      (yesNoQuestion): YesNoOptionGridEntry[] => {
        const yesCoordinates = timingMarkCoordinatesFromOxOy(
          yesNoQuestion.yesOx,
          yesNoQuestion.yesOy
        );
        const noCoordinates = timingMarkCoordinatesFromOxOy(
          yesNoQuestion.noOx,
          yesNoQuestion.noOy
        );
        return [
          {
            type: 'yesno',
            question: yesNoQuestion,
            option: 'yes',
            ...yesCoordinates,
          },
          {
            type: 'yesno',
            question: yesNoQuestion,
            option: 'no',
            ...noCoordinates,
          },
        ];
      }
    ),
  ];
}
