import { expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  convertPdfToGrayscale,
  convertPdfToSpotColor,
  NhStateSpotColors,
} from '@votingworks/hmpb';

import { normalizeBallotColorModeForPrinting } from './ballot_pdfs';

vi.mock(import('@votingworks/hmpb'), async (importActual) => ({
  ...(await importActual()),
  convertPdfToGrayscale: vi.fn(),
  convertPdfToSpotColor: vi.fn(),
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

test('normalizeBallotColorModeForPrinting - converts NH state ballots to spot color', async () => {
  const mockColorPdf = Buffer.of(0xca, 0xfe);
  const mockSpotColorPdf = Buffer.of(0xfa, 0xce);
  vi.mocked(convertPdfToSpotColor).mockResolvedValueOnce(mockSpotColorPdf);

  expect(
    await normalizeBallotColorModeForPrinting(mockColorPdf, 'NhStateBallot')
  ).toStrictEqual(mockSpotColorPdf);
  expect(convertPdfToSpotColor).toHaveBeenCalledWith(
    mockColorPdf,
    Object.values(NhStateSpotColors)
  );
});

test('normalizeBallotColorModeForPrinting - doesnt convert non-NH ballots', async () => {
  const mockColorPdf = Buffer.of(0xac, 0xfe);

  expect(
    await normalizeBallotColorModeForPrinting(mockColorPdf, 'VxDefaultBallot')
  ).toStrictEqual(mockColorPdf);

  expect(convertPdfToGrayscale).not.toHaveBeenCalled();
});
