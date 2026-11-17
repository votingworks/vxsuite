import { expect, test, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import {
  convertPdfFileToGrayscale,
  convertPdfToSpotColor,
  NhStateSpotColors,
} from '@votingworks/hmpb';
import { makeTemporaryFile } from '@votingworks/fixtures';

import { normalizeBallotColorModeForPrinting } from './ballot_pdfs.js';

vi.mock(import('@votingworks/hmpb'), async (importActual) => ({
  ...(await importActual()),
  convertPdfFileToGrayscale: vi.fn(),
  convertPdfToSpotColor: vi.fn(),
}));

test('normalizeBallotColorModeForPrinting - converts NH ballots to grayscale', async () => {
  const mockColorPdf = Buffer.of(0xca, 0xfe);
  const mockGrayscalePdfNh = Buffer.of(0xca, 0xef);

  vi.mocked(convertPdfFileToGrayscale).mockImplementationOnce(async (p) => {
    await fs.writeFile(p, mockGrayscalePdfNh);
  });

  const ballotPath = makeTemporaryFile({ content: mockColorPdf });
  const ballotTemplateId = 'NhBallot';
  await normalizeBallotColorModeForPrinting({ ballotPath, ballotTemplateId });

  expect(await fs.readFile(ballotPath)).toStrictEqual(mockGrayscalePdfNh);
});

test('normalizeBallotColorModeForPrinting - converts NH state ballots to spot color', async () => {
  const mockColorPdf = Buffer.of(0xca, 0xfe);
  const mockSpotColorPdf = Buffer.of(0xfa, 0xce);

  vi.mocked(convertPdfToSpotColor).mockImplementationOnce(async (p) => {
    expect(p.spotColors).toEqual(Object.values(NhStateSpotColors));
    await fs.writeFile(p.pdfPath, mockSpotColorPdf);
  });

  const ballotPath = makeTemporaryFile({ content: mockColorPdf });
  const ballotTemplateId = 'NhStateBallot';
  await normalizeBallotColorModeForPrinting({ ballotPath, ballotTemplateId });

  expect(await fs.readFile(ballotPath)).toStrictEqual(mockSpotColorPdf);
});

test('normalizeBallotColorModeForPrinting - doesnt convert non-NH ballots', async () => {
  const mockColorPdf = Buffer.of(0xac, 0xfe);

  const ballotPath = makeTemporaryFile({ content: mockColorPdf });
  const ballotTemplateId = 'VxDefaultBallot';
  await normalizeBallotColorModeForPrinting({ ballotPath, ballotTemplateId });

  expect(await fs.readFile(ballotPath)).toStrictEqual(mockColorPdf);
});
