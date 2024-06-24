import {
  AsyncIteratorPlus,
  assert,
  assertDefined,
  iter,
} from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { pdfToImages } from '@votingworks/image-utils';
import { SheetOf } from '@votingworks/types';
import { Buffer } from 'buffer';
import { ImageData } from 'canvas';
import { readFileSync } from 'fs';
import { writePageImagesToImagePaths } from './interpretation';

function renderPdfDataToPageImages(pdf: Buffer): AsyncIteratorPlus<ImageData> {
  return iter(pdfToImages(pdf, { scale: 200 / 72 })).map((page) => page.page);
}

async function renderBmdBallotPdfDataToPageImages(
  bmdBallotPdf: Buffer
): Promise<SheetOf<ImageData>> {
  const pages = await renderPdfDataToPageImages(bmdBallotPdf).toArray();
  assert(pages.length === 1);

  return [
    assertDefined(pages[0]),
    await electionFamousNames2021Fixtures.machineMarkedBallotPage2.asImageData(),
  ];
}

async function renderBmdBallotPdfDataToImagePaths(
  bmdBallotPdf: Buffer
): Promise<SheetOf<string>> {
  const pages = await renderPdfDataToPageImages(bmdBallotPdf).toArray();
  assert(pages.length === 1);

  const [pagePath] = await writePageImagesToImagePaths(pages).toArray();
  return [
    assertDefined(pagePath),
    electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
  ];
}

export interface BallotFixture {
  asBmdSheetImages(): Promise<SheetOf<ImageData>>;
  asBmdSheetPaths(): Promise<SheetOf<string>>;
  asHmpbImages(): AsyncIteratorPlus<ImageData>;
  asHmpbPaths(): AsyncIteratorPlus<string>;
}

export function ballotFixture(pdfData: Buffer): BallotFixture;
export function ballotFixture(pdfPath: string): BallotFixture;
export function ballotFixture(pdf: Buffer | string): BallotFixture {
  const pdfData = typeof pdf === 'string' ? readFileSync(pdf) : pdf;
  return {
    asBmdSheetImages: async () => renderBmdBallotPdfDataToPageImages(pdfData),
    asBmdSheetPaths: async () => renderBmdBallotPdfDataToImagePaths(pdfData),
    asHmpbImages: () => renderPdfDataToPageImages(pdfData),
    asHmpbPaths: () =>
      writePageImagesToImagePaths(renderPdfDataToPageImages(pdfData)),
  };
}
