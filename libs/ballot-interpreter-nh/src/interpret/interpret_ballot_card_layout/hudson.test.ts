import { typedAs } from '@votingworks/utils';
import { ImageData } from 'canvas';
import { HudsonFixtureName, readFixtureImage } from '../../../test/fixtures';
import { testImageDebugger } from '../../../test/utils';
import { ScannedBallotCardGeometry8pt5x14 } from '../../accuvote';
import {
  interpretBallotCardLayout,
  InterpretBallotCardLayoutResult,
} from '../interpret_ballot_card_layout';

test.each([
  'scan-unmarked-front',
  'scan-marked-front',
  'scan-marked-front-300dpi',
  'scan-marked-rotated-front',
])('%s', async (name) => {
  const geometry = ScannedBallotCardGeometry8pt5x14;
  const frontImageData = await readFixtureImage(
    HudsonFixtureName,
    name,
    geometry
  );
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
  'scan-unmarked-back',
  'scan-marked-back',
  'scan-marked-back-300dpi',
  'scan-marked-rotated-back',
])('%s', async (name) => {
  const geometry = ScannedBallotCardGeometry8pt5x14;
  const backImageData = await readFixtureImage(
    HudsonFixtureName,
    name,
    geometry
  );
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
