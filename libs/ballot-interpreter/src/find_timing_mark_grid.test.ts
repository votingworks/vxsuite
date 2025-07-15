import { timingMarkPaperFixtures } from '@votingworks/hmpb';
import { HmpbBallotPaperSize } from '@votingworks/types';
import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { join } from 'node:path';
import { loadImageData } from '@votingworks/image-utils';
import { pdfToPageImages } from '../test/helpers/interpretation';
import { findTimingMarkGrid } from './hmpb-ts/addon';

test('letter-sized timing mark paper', async () => {
  const { pdf } = timingMarkPaperFixtures.specPaths({
    paperSize: HmpbBallotPaperSize.Letter,
  });
  const pdfBytes = Uint8Array.from(await readFile(pdf));
  const pdfPage = await pdfToPageImages(pdfBytes).first();
  const { topLeftMark, topRightMark, bottomLeftMark, bottomRightMark } =
    findTimingMarkGrid(pdfPage!);

  // The fixture has perfect alignment, so that should be reflected in the marks we find.
  expect(topLeftMark.rect.top).toEqual(topRightMark.rect.top);
  expect(bottomLeftMark.rect.top).toEqual(bottomRightMark.rect.top);
  expect(topLeftMark.rect.left).toEqual(bottomLeftMark.rect.left);
  expect(topRightMark.rect.left).toEqual(bottomRightMark.rect.left);
});

test('scanned image', async () => {
  const { topLeftMark, topRightMark } = findTimingMarkGrid(
    await loadImageData(
      join(__dirname, '../test/fixtures/vxqa-2024-10/skew-front.png')
    )
  );

  // We know the top-right mark is higher than the top-left mark in this fixture.
  expect(topRightMark.rect.top).toBeLessThan(topLeftMark.rect.top);
});
