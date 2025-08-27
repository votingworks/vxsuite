import { expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { convertPdfToGrayscale } from '@votingworks/hmpb';

import { normalizeBallotColorModeForPrinting } from './ballot_pdfs';

vi.mock(import('@votingworks/hmpb'), async (importActual) => ({
  ...(await importActual()),
  convertPdfToGrayscale: vi.fn(),
}));

test('normalizeBallotColorModeForPrinting - converts NH ballots to grayscale', async () => {
  const mockColorPdf = Buffer.of(0xca, 0xfe);
  const mockGrayscalePdfNh = Buffer.of(0xca, 0xef);
  vi.mocked(convertPdfToGrayscale).mockResolvedValueOnce(mockGrayscalePdfNh);

  expect(
    await normalizeBallotColorModeForPrinting(mockColorPdf, 'NhBallot')
  ).toStrictEqual(mockGrayscalePdfNh);
  expect(convertPdfToGrayscale).toHaveBeenCalledWith(mockColorPdf);
});

test('normalizeBallotColorModeForPrinting - doesnt convert non-NH ballots', async () => {
  const mockColorPdf = Buffer.of(0xac, 0xfe);

  expect(
    await normalizeBallotColorModeForPrinting(mockColorPdf, 'VxDefaultBallot')
  ).toStrictEqual(mockColorPdf);

  expect(convertPdfToGrayscale).not.toHaveBeenCalled();
});
