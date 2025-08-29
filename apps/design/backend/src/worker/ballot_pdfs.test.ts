import { expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';

import {
  convertPdfToGrayscale,
  type BaseBallotProps,
  ColorTints,
  type NhBallotProps,
} from '@votingworks/hmpb';

import { normalizeBallotColorModeForPrinting } from './ballot_pdfs';

vi.mock(import('@votingworks/hmpb'), async (importActual) => ({
  ...(await importActual()),
  convertPdfToGrayscale: vi.fn(),
}));

test('normalizeBallotColorModeForPrinting - converts non-tinted ballots to grayscale', async () => {
  const nhProps: NhBallotProps = {
    colorTint: undefined,
    precinctId: 'nh-precinct',
  } as unknown as NhBallotProps;

  const mockColorPdf = Buffer.of(0xca, 0xfe);
  const mockGrayscalePdfNh = Buffer.of(0xca, 0xef);
  vi.mocked(convertPdfToGrayscale).mockResolvedValueOnce(mockGrayscalePdfNh);

  expect(
    await normalizeBallotColorModeForPrinting(mockColorPdf, nhProps)
  ).toStrictEqual(mockGrayscalePdfNh);
  expect(convertPdfToGrayscale).toHaveBeenCalledWith(mockColorPdf);

  const nonNhProps: BaseBallotProps = {
    precinctId: 'non-nh-precinct',
  } as unknown as BaseBallotProps;

  const mockGrayscalePdfNonNh = Buffer.of(0xac, 0xfe);
  vi.mocked(convertPdfToGrayscale).mockResolvedValueOnce(mockGrayscalePdfNonNh);

  expect(
    await normalizeBallotColorModeForPrinting(mockColorPdf, nonNhProps)
  ).toStrictEqual(mockGrayscalePdfNonNh);
});

test('normalizeBallotColorModeForPrinting - renders tinted NH ballots in color', async () => {
  const nhProps: NhBallotProps = {
    colorTint: ColorTints.YELLOW,
    precinctId: 'nh-precinct',
  } as unknown as NhBallotProps;

  const mockColorPdf = Buffer.of(0xca, 0xfe);

  vi.mocked(convertPdfToGrayscale).mockRejectedValue(
    new Error('unexpected grayscale conversion')
  );

  expect(
    await normalizeBallotColorModeForPrinting(mockColorPdf, nhProps)
  ).toStrictEqual(mockColorPdf);
});
