import { expect, test } from 'vitest';
import { join } from 'node:path';
import { loadImageData } from '@votingworks/image-utils';
import { runBlankPaperDiagnostic } from './diagnostic';

const BLANK_IMAGE_PATH = join(
  __dirname,
  '../../test/fixtures/diagnostic/blank/20lb/bc0367d0-444a-4f1b-a88e-78de0bda5cb5-back.jpg'
);
const STREAKED_IMAGE_PATH = join(
  __dirname,
  '../../test/fixtures/diagnostic/streaked/0dc29646-3c6a-4abd-9d2d-ae1b03a3b4ad-front.jpg'
);

test('runBlankPaperDiagnostic can pass', async () => {
  expect(await runBlankPaperDiagnostic(BLANK_IMAGE_PATH)).toEqual(true);
});

test('runBlankPaperDiagnostic can fail', async () => {
  expect(await runBlankPaperDiagnostic(STREAKED_IMAGE_PATH)).toEqual(false);
});

test('runBlankPaperDiagnostic can pass with image data', async () => {
  const imageData = (await loadImageData(BLANK_IMAGE_PATH)).unsafeUnwrap();
  expect(await runBlankPaperDiagnostic(imageData)).toEqual(true);
});

test('runBlankPaperDiagnostic can fail with image data', async () => {
  const imageData = (await loadImageData(STREAKED_IMAGE_PATH)).unsafeUnwrap();
  expect(await runBlankPaperDiagnostic(imageData)).toEqual(false);
});
