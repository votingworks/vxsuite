import { safeParseElectionDefinition } from '@votingworks/types';
import { join } from 'path';
import { readFileSync } from 'fs';
import { Fixture } from '../../fixtures';

export const electionDefinition = safeParseElectionDefinition(
  readFileSync(join(__dirname, 'election.json'), 'utf-8')
).unsafeUnwrap();
export const { election } = electionDefinition;

/**
 * This ballot is well-marked, scanned straight, has no artifacts, etc.
 */
export const p1BestCaseScenario = new Fixture(
  join(__dirname, 'p1-best-case-scenario.jpeg')
);

/**
 * This one has contest bounding boxes that overlap with each other.
 */
export const p1OverlappingBoundingBoxes = new Fixture(
  join(__dirname, 'p1-overlapping-bounding-boxes.jpeg')
);

/**
 * This one is a little skewed/rotated.
 */
export const p2Skewed = new Fixture(join(__dirname, 'p2-skewed.jpeg'));

/**
 * This one has uneven gaps due to folds on the either/neither contest.
 */
export const p2UnevenContestBoxFoldGaps = new Fixture(
  join(__dirname, 'p2-uneven-contest-box-fold-gaps.png')
);

/**
 * This one has even gaps due to folds on the either/neither contest.
 */
export const p2EvenContestBoxFoldGaps = new Fixture(
  join(__dirname, 'p2-even-contest-box-fold-gaps.png')
);

/**
 * This one has a fold line sticking out of a contest.
 */
export const p2FoldLines = new Fixture(join(__dirname, 'p2-fold-lines.png'));

/**
 * Template image for District 5, page 1.
 */
export const district5BlankPage1 = new Fixture(
  join(
    __dirname,
    'election-e5a8525177-precinct-district-5-id-6522-style-5-English-test-p1.jpeg'
  )
);

/**
 * Template image for District 5, page 2.
 */
export const district5BlankPage2 = new Fixture(
  join(
    __dirname,
    'election-e5a8525177-precinct-district-5-id-6522-style-5-English-test-p2.jpeg'
  )
);
