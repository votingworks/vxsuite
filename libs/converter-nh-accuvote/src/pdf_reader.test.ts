import { iter } from '@votingworks/basics';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { asSheet } from '@votingworks/types';
import { PdfReader } from './pdf_reader';

test('PdfReader', async () => {
  const pdfData =
    electionGridLayoutNewHampshireTestBallotFixtures.templatePdf.asBuffer();
  const pdfReader = new PdfReader(pdfData, { scale: 1 });

  expect(pdfReader.getOriginalData().equals(pdfData)).toBeTruthy();
  expect(await pdfReader.getPageCount()).toEqual(2);
  expect(await pdfReader.getPage(1)).toBeDefined();
  expect(await pdfReader.getPage(2)).toBeDefined();
  expect(await pdfReader.getPage(3)).toBeUndefined();
  asSheet(await iter(pdfReader.pages()).toArray());
});

// this is here for coverage purposes
test('render out of bounds page immediately', async () => {
  const pdfData =
    electionGridLayoutNewHampshireTestBallotFixtures.templatePdf.asBuffer();
  const pdfReader = new PdfReader(pdfData);
  expect(await pdfReader.getPage(3)).toBeUndefined();
});
