import { typedAs } from '@votingworks/utils';
import { HudsonFixtureName, readFixtureImage } from '../../test/fixtures';
import { ScannedBallotCardGeometry8pt5x14 } from '../accuvote';
import { withSvgDebugger } from '../debug';
import {
  ScannedBallotBackPageLayout,
  ScannedBallotFrontPageLayout,
} from '../types';
import { interpretPageLayout } from './interpret_page_layout';

test('interpretPageLayout front', async () => {
  const frontImageData = await readFixtureImage(
    HudsonFixtureName,
    'scan-unmarked-front'
  );
  const frontLayout = await withSvgDebugger(async (debug) => {
    debug.imageData(0, 0, frontImageData);
    return interpretPageLayout(frontImageData, {
      geometry: ScannedBallotCardGeometry8pt5x14,
      debug,
    });
  });
  expect(frontLayout).toEqual(
    typedAs<ScannedBallotFrontPageLayout>({
      side: 'front',
      metadata: {
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
      partialMarks: expect.any(Object),
      completeMarks: expect.any(Object),
    })
  );
});

test('interpretPageLayout unmarked back', async () => {
  const backImageData = await readFixtureImage(
    HudsonFixtureName,
    'scan-unmarked-back'
  );
  const backLayout = await withSvgDebugger(async (debug) => {
    debug.imageData(0, 0, backImageData);
    return interpretPageLayout(backImageData, {
      geometry: ScannedBallotCardGeometry8pt5x14,
      debug,
    });
  });
  expect(backLayout).toEqual(
    typedAs<ScannedBallotBackPageLayout>({
      side: 'back',
      metadata: {
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
      partialMarks: expect.any(Object),
      completeMarks: expect.any(Object),
    })
  );
});
