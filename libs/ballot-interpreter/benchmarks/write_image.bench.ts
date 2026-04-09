import { test } from 'vitest';
import { writeImageData } from '@votingworks/image-utils';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { join } from 'node:path';
import { dirSync } from 'tmp';
import { removeSync } from 'fs-extra';
import assert from 'node:assert';
import { pdfToPageImages } from '../test/helpers/interpretation';
import { writeImageDataToPng } from '../src/bubble-ballot-ts';
import { benchmarkRegressionTest } from './benchmarking';

const { blankBallotPath } = vxFamousNamesFixtures;

test('writeImageData (Canvas) vs writeImageToPng (Rust)', async () => {
  const image = await pdfToPageImages(blankBallotPath).first();
  assert(image);

  // eslint-disable-next-line no-console
  console.log(`Image size: ${image.width}x${image.height}`);

  const tmpPath = dirSync().name;

  try {
    await benchmarkRegressionTest({
      label: 'writeImageData (Canvas)',
      func: async () => {
        await writeImageData(join(tmpPath, 'canvas.png'), image);
      },
      runs: 50,
    });

    await benchmarkRegressionTest({
      label: 'writeImageToPng (Rust)',
      func: async () => {
        await writeImageDataToPng(join(tmpPath, 'rust.png'), image);
      },
      runs: 50,
    });
  } finally {
    removeSync(tmpPath);
  }
});
