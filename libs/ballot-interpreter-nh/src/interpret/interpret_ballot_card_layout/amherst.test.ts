import { typedAs } from '@votingworks/utils';
import { ImageData } from 'canvas';
import { AmherstFixtureName, readFixtureImage } from '../../../test/fixtures';
import { testImageDebugger } from '../../../test/utils';
import { ScannedBallotCardGeometry8pt5x11 } from '../../accuvote';
import {
  interpretBallotCardLayout,
  InterpretBallotCardLayoutResult,
} from '../interpret_ballot_card_layout';

test.each([
  'scan-unmarked-front',
  'scan-marked-front',
  'scan-marked-stretch-front',
  'scan-marked-stretch-mid-front',
])('%s', async (name) => {
  const geometry = ScannedBallotCardGeometry8pt5x11;
  const frontImageData = await readFixtureImage(
    AmherstFixtureName,
    name,
    geometry
  );
  const { imageData, ...frontLayout } = interpretBallotCardLayout(
    frontImageData,
    {
      geometry,
      debug: testImageDebugger(frontImageData),
    }
  );
  expect(imageData instanceof ImageData).toBe(true);
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
  'scan-unmarked-back',
  'scan-marked-back',
  'scan-marked-stretch-back',
  'scan-marked-stretch-mid-back',
])('%s', async (name) => {
  const geometry = ScannedBallotCardGeometry8pt5x11;
  const backImageData = await readFixtureImage(
    AmherstFixtureName,
    name,
    geometry
  );
  const { imageData, ...backLayout } = interpretBallotCardLayout(
    backImageData,
    {
      geometry,
      debug: testImageDebugger(backImageData),
    }
  );
  expect(imageData instanceof ImageData).toBe(true);
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
