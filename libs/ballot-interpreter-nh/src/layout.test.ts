import {
  BallotPageLayout,
  BallotType,
  safeParseElectionDefinition,
} from '@votingworks/types';
import {
  HudsonFixtureName,
  readFixtureImage,
  readFixtureJson,
} from '../test/fixtures';
import { ScannedBallotCardGeometry8pt5x14 } from './accuvote';
import { withCanvasDebugger } from './debug';
import {
  generateBallotPageLayouts,
  layoutTimingMarksForGeometry,
} from './layout';

test('layoutTimingMarksForGeometry', () => {
  const layout = layoutTimingMarksForGeometry(ScannedBallotCardGeometry8pt5x14);
  expect(layout.left).toHaveLength(
    ScannedBallotCardGeometry8pt5x14.gridSize.height
  );
  expect(layout.right).toHaveLength(
    ScannedBallotCardGeometry8pt5x14.gridSize.height
  );
  expect(layout.top).toHaveLength(
    ScannedBallotCardGeometry8pt5x14.gridSize.width
  );
  expect(layout.bottom).toHaveLength(
    ScannedBallotCardGeometry8pt5x14.gridSize.width
  );
});

test('generateBallotPageLayouts', async () => {
  const electionDefinition = safeParseElectionDefinition(
    await readFixtureJson(HudsonFixtureName, 'election')
  ).unsafeUnwrap();
  const layout = generateBallotPageLayouts(electionDefinition.election, {
    ballotStyleId: electionDefinition.election.ballotStyles[0]!.id,
    precinctId: electionDefinition.election.precincts[0]!.id,
    ballotType: BallotType.Standard,
    isTestMode: true,
    electionHash: electionDefinition.electionHash,
    locales: { primary: 'en-US' },
  }).unsafeUnwrap();

  expect(layout).toHaveLength(2 /* front and back */);
  const [frontLayout, backLayout] = layout as [
    BallotPageLayout,
    BallotPageLayout
  ];
  expect(frontLayout.metadata.pageNumber).toEqual(1);
  expect(backLayout.metadata.pageNumber).toEqual(2);
  expect(frontLayout.contests).toHaveLength(
    7 /* president, governor, senator, representative, councilor, state senator, state representative */
  );
  expect(backLayout.contests).toHaveLength(
    6 /* sheriff, attorney, treasurer, register of deeds, register of probate, county commissioner */
  );

  const president = frontLayout.contests[0]!;
  expect(president.options).toHaveLength(
    4 /* trump, biden, jorgensen, write-in */
  );

  // Uncomment this to write debug images for each contest & option:
  // (await import('./debug')).setDebug(true);

  const frontImageData = await readFixtureImage(
    HudsonFixtureName,
    'scan-marked-front'
  );

  for (const contest of frontLayout.contests) {
    withCanvasDebugger(contest.bounds.width, contest.bounds.height, (debug) => {
      debug.imageData(-contest.bounds.x, -contest.bounds.y, frontImageData);
    });

    for (const option of contest.options) {
      withCanvasDebugger(option.bounds.width, option.bounds.height, (debug) => {
        debug.imageData(-option.bounds.x, -option.bounds.y, frontImageData);
      });
    }
  }
});
