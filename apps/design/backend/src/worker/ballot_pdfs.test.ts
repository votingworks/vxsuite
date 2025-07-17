import { expect, Mocked, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';

import {
  convertPdfToGrayscale,
  type BaseBallotProps,
  ColorTints,
  type NhBallotProps,
  type RenderDocument,
} from '@votingworks/hmpb';

import { renderBallotPdf } from './ballot_pdfs';

vi.mock(import('@votingworks/hmpb'), async (importActual) => ({
  ...(await importActual()),
  convertPdfToGrayscale: vi.fn(),
}));

test('renderBallotPdf - converts non-tinted ballots to grayscale', async () => {
  const nhProps: NhBallotProps = {
    colorTint: undefined,
    precinctId: 'nh-precinct',
  } as unknown as NhBallotProps;

  const mockColorPdf = Buffer.of(0xca, 0xfe);
  const mockDocument: Mocked<RenderDocument> = {
    renderToPdf: vi.fn(() => mockColorPdf),
  } as unknown as Mocked<RenderDocument>;

  const mockGrayscalePdfNh = Buffer.of(0xca, 0xef);
  vi.mocked(convertPdfToGrayscale).mockResolvedValueOnce(mockGrayscalePdfNh);

  expect(await renderBallotPdf(nhProps, mockDocument)).toStrictEqual(
    mockGrayscalePdfNh
  );
  expect(convertPdfToGrayscale).toHaveBeenCalledWith(mockColorPdf);

  const nonNhProps: BaseBallotProps = {
    precinctId: 'non-nh-precinct',
  } as unknown as BaseBallotProps;

  const mockGrayscalePdfNonNh = Buffer.of(0xac, 0xfe);
  vi.mocked(convertPdfToGrayscale).mockResolvedValueOnce(mockGrayscalePdfNonNh);

  expect(await renderBallotPdf(nonNhProps, mockDocument)).toStrictEqual(
    mockGrayscalePdfNonNh
  );
});

test('renderBallotPdf - renders tinted NH ballots in color', async () => {
  const nhProps: NhBallotProps = {
    colorTint: ColorTints.YELLOW,
    precinctId: 'nh-precinct',
  } as unknown as NhBallotProps;

  const mockColorPdf = Buffer.of(0xca, 0xfe);
  const mockDocument: Mocked<RenderDocument> = {
    renderToPdf: vi.fn(() => mockColorPdf),
  } as unknown as Mocked<RenderDocument>;

  vi.mocked(convertPdfToGrayscale).mockRejectedValue(
    new Error('unexpected grayscale conversion')
  );

  expect(await renderBallotPdf(nhProps, mockDocument)).toStrictEqual(
    mockColorPdf
  );
});
