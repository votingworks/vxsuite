import {
  AdjudicationInfo,
  AdjudicationReason,
  GridPosition,
  safeParseElection,
} from '@votingworks/types';
import { assert, typedAs } from '@votingworks/utils';
import { AmherstFixtureName, readFixtureJson } from '../../test/fixtures';
import { makeRect, vec } from '../utils';
import { convertMarksToAdjudicationInfo } from './convert_marks_to_adjudication_info';

test('multi-party endorsement', async () => {
  const election = safeParseElection(
    await readFixtureJson(AmherstFixtureName, 'election')
  ).unsafeUnwrap();
  const multiPartyContestId = 'Sheriff-4243fe0b';
  const multiPartyContest = election.contests.find(
    (contest) => contest.id === multiPartyContestId
  )!;
  const contestGridPositions = election.gridLayouts![0]!.gridPositions.filter(
    (gridPosition) => gridPosition.contestId === multiPartyContestId
  );
  const [
    candidateGridPositionDemocrat,
    candidateGridPositionRepublican,
    writeInGridPosition,
  ] = contestGridPositions;
  assert(
    candidateGridPositionDemocrat &&
      candidateGridPositionRepublican &&
      writeInGridPosition
  );
  assert(
    candidateGridPositionDemocrat.type === 'option' &&
      candidateGridPositionRepublican.type === 'option' &&
      writeInGridPosition.type === 'write-in' &&
      candidateGridPositionDemocrat.optionId ===
        candidateGridPositionRepublican.optionId
  );

  const validCases: Array<GridPosition[]> = [
    [candidateGridPositionDemocrat],
    [candidateGridPositionRepublican],
    [writeInGridPosition],
    [candidateGridPositionDemocrat, candidateGridPositionRepublican],
  ];

  for (const selections of validCases) {
    expect(
      convertMarksToAdjudicationInfo({
        contests: [multiPartyContest],
        enabledReasons: [
          AdjudicationReason.Overvote,
          AdjudicationReason.Undervote,
          AdjudicationReason.BlankBallot,
        ],
        markThresholds: {
          marginal: 0.08,
          definite: 0.12,
        },
        ovalMarks: contestGridPositions.map((gridPosition) => ({
          gridPosition,
          score: selections.includes(gridPosition) ? 0.5 : 0,
          scoredOffset: vec(0, 0),
          bounds: makeRect({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
        })),
      })
    ).toStrictEqual(
      typedAs<AdjudicationInfo>({
        requiresAdjudication: false,
        enabledReasonInfos: [],
        enabledReasons: expect.any(Array),
        ignoredReasonInfos: expect.any(Array),
      })
    );
  }
});
