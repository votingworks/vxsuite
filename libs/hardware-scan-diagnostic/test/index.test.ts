import { encodeImageData, writeImageData } from '@votingworks/image-utils';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { analyzeScannedPage, createDebugImage, loadImage } from '../index.js';

// Set this to generate debug images in `fixtures/debug`.
const { GENERATE_ALL_DEBUG_IMAGES } = process.env;

test.each([
  'legal-failed-feed-bottom.png',
  'legal-failed-feed-top.png',
  'legal-rotate-bottom.png',
  'legal-rotate-top.png',
  'legal-uneven-leading-edge-huge-error-bottom.png',
  'legal-uneven-leading-edge-huge-error-top.png',
  'letter-cut-corner-top.png',
  'letter-cut-corner-bottom.png',
  'letter-uneven-leading-edge-large-error-bottom.png',
  'letter-uneven-leading-edge-large-error-top.png',
  'letter-uneven-leading-edge-small-error-bottom.png',
  'letter-uneven-leading-edge-small-error-top.png',
])('analyze: %s', async (name) => {
  const path = join(__dirname, 'fixtures', name);
  const image = await loadImage(path);
  const analysis = await analyzeScannedPage(image);

  if (GENERATE_ALL_DEBUG_IMAGES) {
    const debugPath = join(__dirname, 'fixtures', 'debug', name);
    await mkdir(dirname(debugPath), { recursive: true });
    const debugImage = await createDebugImage(image, analysis);
    await writeImageData(debugPath, debugImage);
  }

  expect(analysis).toMatchSnapshot();
});

test('analysis debug image', async () => {
  const image = await loadImage(
    join(__dirname, 'fixtures/legal-uneven-leading-edge-huge-error-top.png')
  );
  const analysis = await analyzeScannedPage(image);
  const debugImage = await createDebugImage(image, analysis);
  expect(await encodeImageData(debugImage, 'image/png')).toMatchImageSnapshot();
});
