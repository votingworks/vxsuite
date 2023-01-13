import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { typedAs } from '@votingworks/utils';
import { ImageData } from 'canvas';
import { readFixtureImage } from '../../../test/fixtures';
import { testImageDebugger } from '../../../test/utils';
import { ScannedBallotCardGeometry8pt5x11 } from '../../accuvote';
import {
  interpretBallotCardLayout,
  InterpretBallotCardLayoutResult,
} from '../interpret_ballot_card_layout';

test.each([
  [
    'scan-unmarked-front',
    electionGridLayoutNewHampshireAmherstFixtures.scanUnmarkedFront.asImage(),
  ],
  [
    'scan-marked-front',
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedFront.asImage(),
  ],
  [
    'scan-marked-stretch-front',
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedStretchFront.asImage(),
  ],
  [
    'scan-marked-stretch-mid-front',
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedStretchMidFront.asImage(),
  ],
  [
    'scan-marked-timing-mark-hole-front',
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedTimingMarkHoleFront.asImage(),
  ],
  [
    'scan-marked-uneven-crop-front',
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedUnevenCropFront.asImage(),
  ],
  [
    'scan-marked-stretch-mark-front',
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedStretchMarkFront.asImage(),
  ],
  [
    'scan-marked-stretch-extra-front',
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedStretchExtraFront.asImage(),
  ],
])('%s', async (name, frontImagePromise) => {
  const geometry = ScannedBallotCardGeometry8pt5x11;
  const frontImageData = readFixtureImage(await frontImagePromise, geometry);
  const { imageData, ...frontLayout } = interpretBallotCardLayout(
    frontImageData,
    {
      geometry,
      debug: testImageDebugger(frontImageData),
    }
  );
  expect(imageData instanceof ImageData).toEqual(true);
  expect(frontLayout.completeTimingMarks.left).toHaveLength(
    geometry.gridSize.height
  );
  expect(frontLayout.completeTimingMarks.right).toHaveLength(
    geometry.gridSize.height
  );
  expect(frontLayout.completeTimingMarks.top).toHaveLength(
    geometry.gridSize.width
  );
  expect(frontLayout.completeTimingMarks.bottom).toHaveLength(
    geometry.gridSize.width
  );
  expect(frontLayout).toStrictEqual(
    expect.objectContaining(
      typedAs<Partial<InterpretBallotCardLayoutResult>>({
        side: 'front',
        metadata: {
          side: 'front',
          bits: [
            0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 1,
          ],
          mod4CheckSum: 2,
          computedMod4CheckSum: 2,
          batchOrPrecinctNumber: 56,
          cardNumber: 3,
          sequenceNumber: 0,
          startBit: 1,
        },
      })
    )
  );
});

test.each([
  [
    'scan-unmarked-back',
    electionGridLayoutNewHampshireAmherstFixtures.scanUnmarkedBack.asImage(),
  ],
  [
    'scan-marked-back',
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedBack.asImage(),
  ],
  [
    'scan-marked-stretch-back',
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedStretchBack.asImage(),
  ],
  [
    'scan-marked-stretch-mid-back',
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedStretchMidBack.asImage(),
  ],
  [
    'scan-marked-timing-mark-hole-back',
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedTimingMarkHoleBack.asImage(),
  ],
  [
    'scan-marked-uneven-crop-back',
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedUnevenCropBack.asImage(),
  ],
  [
    'scan-marked-stretch-mark-back',
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedStretchMarkBack.asImage(),
  ],
  [
    'scan-marked-stretch-extra-back',
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedStretchExtraBack.asImage(),
  ],
])('%s', async (name, backImagePromise) => {
  const geometry = ScannedBallotCardGeometry8pt5x11;
  const backImageData = readFixtureImage(await backImagePromise, geometry);
  const { imageData, ...backLayout } = interpretBallotCardLayout(
    backImageData,
    {
      geometry,
      debug: testImageDebugger(backImageData),
    }
  );
  expect(imageData instanceof ImageData).toEqual(true);
  expect(backLayout.completeTimingMarks.left).toHaveLength(
    geometry.gridSize.height
  );
  expect(backLayout.completeTimingMarks.right).toHaveLength(
    geometry.gridSize.height
  );
  expect(backLayout.completeTimingMarks.top).toHaveLength(
    geometry.gridSize.width
  );
  expect(backLayout.completeTimingMarks.bottom).toHaveLength(
    geometry.gridSize.width
  );
  expect(backLayout).toStrictEqual(
    expect.objectContaining(
      typedAs<Partial<InterpretBallotCardLayoutResult>>({
        side: 'back',
        metadata: {
          side: 'back',
          bits: [
            0, 0, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1,
            1, 1, 1, 0, 1, 1, 1, 1, 0,
          ],
          electionDay: 12,
          electionMonth: 7,
          electionYear: 22,
          electionType: 'G',
          enderCode: [0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
          expectedEnderCode: [0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
        },
      })
    )
  );
});
