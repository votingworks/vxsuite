import path from 'node:path';
import * as builders from '../builders';

export const definitionXml = builders.file(
  'data/electionGridLayoutNewHampshireTestBallot/definition.xml'
);
export const electionJson = builders.election(
  'data/electionGridLayoutNewHampshireTestBallot/election.json'
);
export const { readElection, readElectionDefinition } = electionJson;
export const scanMarkedFront = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-front.jpeg'
);
export const scanMarkedFrontUnmarkedWriteIns = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-front-unmarked-write-ins.jpeg'
);
export const scanMarkedBackUnmarkedWriteIns = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-back-unmarked-write-ins.jpeg'
);
export const scanMarkedFrontUnmarkedWriteInsOvervote = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-front-unmarked-write-ins-overvote.jpeg'
);
export const scanMarkedBackUnmarkedWriteInsOvervote = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-back-unmarked-write-ins-overvote.jpeg'
);
export const scanMarkedBack = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-back.jpeg'
);
export const scanMarkedOvervoteFront = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-overvote-front.jpeg'
);
export const scanMarkedOvervoteBack = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-overvote-back.jpeg'
);
export const scanMarkedStretchFront = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-stretch-front.jpeg'
);
export const scanMarkedStretchBack = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-stretch-back.jpeg'
);
export const scanMarkedStretchExtraFront = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-stretch-extra-front.jpeg'
);
export const scanMarkedStretchExtraBack = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-stretch-extra-back.jpeg'
);
export const scanMarkedStretchMarkFront = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-stretch-mark-front.jpeg'
);
export const scanMarkedStretchMarkBack = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-stretch-mark-back.jpeg'
);
export const scanMarkedStretchMidFront = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-stretch-mid-front.jpeg'
);
export const scanMarkedStretchMidBack = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-stretch-mid-back.jpeg'
);
export const scanMarkedTimingMarkHoleFront = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-timing-mark-hole-front.jpeg'
);
export const scanMarkedTimingMarkHoleBack = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-timing-mark-hole-back.jpeg'
);
export const scanMarkedUnevenCropFront = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-uneven-crop-front.jpeg'
);
export const scanMarkedUnevenCropBack = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-uneven-crop-back.jpeg'
);
export const scanMarkedGrainyTimingMarksFront = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-grainy-timing-marks-front.jpeg'
);
export const scanMarkedGrainyTimingMarksBack = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-marked-grainy-timing-marks-back.jpeg'
);
export const scanUnmarkedFront = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-unmarked-front.jpeg'
);
export const scanUnmarkedBack = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/scan-unmarked-back.jpeg'
);
export const templateFront = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/template-front.jpeg'
);
export const templateBack = builders.image(
  'data/electionGridLayoutNewHampshireTestBallot/template-back.jpeg'
);
export const templatePdf = builders.file(
  'data/electionGridLayoutNewHampshireTestBallot/template.pdf'
);

// Generated by libs/fixture-generators script: pnpm generate-cvr-fixtures
const castVoteRecords = builders.directory(
  'data/electionGridLayoutNewHampshireTestBallot/castVoteRecords'
);
export const castVoteRecordExport = {
  asDirectoryPath: () =>
    path.join(
      castVoteRecords.asDirectoryPath(),
      'machine_0000__2024-01-01_00-00-00'
    ),
} as const;

export const manualCastVoteRecordExport = {
  asDirectoryPath: () => path.join(castVoteRecords.asDirectoryPath(), 'manual'),
} as const;
