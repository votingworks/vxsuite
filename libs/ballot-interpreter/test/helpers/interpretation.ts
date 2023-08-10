import { assertDefined, iter } from '@votingworks/basics';
import {
  renderDocumentToPdf,
  voteToOptionId,
} from '@votingworks/hmpb-render-backend';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import { SheetOf, Vote, VotesDict } from '@votingworks/types';
import { tmpNameSync } from 'tmp';
import { Buffer } from 'buffer';
import { Document } from '@votingworks/hmpb-layout';
import { readFile } from 'fs/promises';

async function pdfToBuffer(pdf: PDFKit.PDFDocument): Promise<Buffer> {
  const promise = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
  });
  pdf.end();
  return promise;
}

async function bufferToImagePaths(buffer: Buffer): Promise<SheetOf<string>> {
  const pageImages = await iter(
    pdfToImages(buffer, { scale: 200 / 72 })
  ).toArray();
  expect(pageImages.length).toEqual(2);
  const pageImagePaths: SheetOf<string> = [
    tmpNameSync({ postfix: '.jpg' }),
    tmpNameSync({ postfix: '.jpg' }),
  ];
  await writeImageData(pageImagePaths[0], assertDefined(pageImages[0]).page);
  await writeImageData(pageImagePaths[1], assertDefined(pageImages[1]).page);
  return pageImagePaths;
}

export async function ballotPdfToPageImages(
  pdfFile: string
): Promise<SheetOf<string>> {
  const pdfBuffer = await readFile(pdfFile);
  return bufferToImagePaths(pdfBuffer);
}

export async function renderBallotToPageImages(
  ballot: Document
): Promise<SheetOf<string>> {
  const pdfStream = renderDocumentToPdf(ballot);
  const pdfBuffer = await pdfToBuffer(pdfStream);
  return bufferToImagePaths(pdfBuffer);
}

export function sortVotes(vote: Vote): Vote {
  return [...vote].sort((a, b) =>
    voteToOptionId(a).localeCompare(voteToOptionId(b))
  ) as Vote;
}

export function sortVotesDict(votes: VotesDict): VotesDict {
  return Object.fromEntries(
    Object.entries(votes).map(([contestId, candidates]) => [
      contestId,
      sortVotes(candidates ?? []),
    ])
  );
}
