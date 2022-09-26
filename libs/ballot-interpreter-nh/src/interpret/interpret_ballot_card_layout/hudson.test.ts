import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { typedAs } from '@votingworks/utils';
import { ImageData } from 'canvas';
import { readFixtureImage } from '../../../test/fixtures';
import { testImageDebugger } from '../../../test/utils';
import { ScannedBallotCardGeometry8pt5x14 } from '../../accuvote';
import {
  interpretBallotCardLayout,
  InterpretBallotCardLayoutResult,
} from '../interpret_ballot_card_layout';

test.each([
  [
    'scan-unmarked-front',
    electionGridLayoutNewHampshireHudsonFixtures.scanUnmarkedFront.asImage(),
  ],
  [
    'scan-marked-front',
    electionGridLayoutNewHampshireHudsonFixtures.scanMarkedFront.asImage(),
  ],
  [
    'scan-marked-front-300dpi',
    electionGridLayoutNewHampshireHudsonFixtures.scanMarkedFront300dpi.asImage(),
  ],
  [
    'scan-marked-rotated-front',
    electionGridLayoutNewHampshireHudsonFixtures.scanMarkedRotatedFront.asImage(),
  ],
])('%s', async (name, frontImagePromise) => {
  const geometry = ScannedBallotCardGeometry8pt5x14;
  const frontImageData = readFixtureImage(await frontImagePromise, geometry);
  const { imageData, ...frontLayout } = interpretBallotCardLayout(
    frontImageData,
    { geometry, debug: testImageDebugger(frontImageData) }
  );
  expect(imageData instanceof ImageData).toBe(true);
  expect(frontLayout).toEqual(
    expect.objectContaining(
      typedAs<Partial<InterpretBallotCardLayoutResult>>({
        side: 'front',
        metadata: {
          side: 'front',
          bits: [
            1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 1,
          ],
          mod4CheckSum: 1,
          computedMod4CheckSum: 1,
          batchOrPrecinctNumber: 53,
          cardNumber: 54,
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
    electionGridLayoutNewHampshireHudsonFixtures.scanUnmarkedBack.asImage(),
  ],
  [
    'scan-marked-back',
    electionGridLayoutNewHampshireHudsonFixtures.scanMarkedBack.asImage(),
  ],
  [
    'scan-marked-back-300dpi',
    electionGridLayoutNewHampshireHudsonFixtures.scanMarkedBack300dpi.asImage(),
  ],
  [
    'scan-marked-rotated-back',
    electionGridLayoutNewHampshireHudsonFixtures.scanMarkedRotatedBack.asImage(),
  ],
])('%s', async (name, backImagePromise) => {
  const geometry = ScannedBallotCardGeometry8pt5x14;
  const backImageData = readFixtureImage(await backImagePromise, geometry);
  const { imageData, ...backLayout } = interpretBallotCardLayout(
    backImageData,
    { geometry, debug: testImageDebugger(backImageData) }
  );
  expect(imageData instanceof ImageData).toBe(true);
  expect(backLayout).toEqual(
    expect.objectContaining(
      typedAs<Partial<InterpretBallotCardLayoutResult>>({
        side: 'back',
        metadata: {
          side: 'back',
          bits: [
            1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1,
            1, 1, 1, 0, 1, 1, 1, 1, 0,
          ],
          electionDay: 3,
          electionMonth: 11,
          electionYear: 20,
          electionType: 'G',
          enderCode: [0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
          expectedEnderCode: [0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
        },
      })
    )
  );
});
