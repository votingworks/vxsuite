import { expect, Mocked, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { convertPdfToGrayscale, type RenderDocument } from '@votingworks/hmpb';
import { renderBallotPdf } from './ballot_pdfs';

vi.mock(import('@votingworks/hmpb'), async (importActual) => ({
  ...(await importActual()),
  convertPdfToGrayscale: vi.fn(),
}));

test('renderBallotPdf - converts ballots to grayscale', async () => {
  const mockColorPdf = Buffer.of(0xca, 0xfe);
  const mockDocument: Mocked<RenderDocument> = {
    renderToPdf: vi.fn(() => mockColorPdf),
  } as unknown as Mocked<RenderDocument>;

  const mockGrayscalePdfNonNh = Buffer.of(0xac, 0xfe);
  vi.mocked(convertPdfToGrayscale).mockResolvedValueOnce(mockGrayscalePdfNonNh);

  expect(await renderBallotPdf(mockDocument)).toStrictEqual(
    mockGrayscalePdfNonNh
  );

  expect(convertPdfToGrayscale).toHaveBeenCalledWith(mockColorPdf);
});
