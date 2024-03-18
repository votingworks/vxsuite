import {
  getEmptyCardCounts,
  getEmptyElectionResults,
} from '@votingworks/utils';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  AdminTallyReportByParty,
  AdminTallyReportByPartyProps,
} from '@votingworks/ui';
import { tmpNameSync } from 'tmp';
import React from 'react';
import { parsePdf } from '@votingworks/image-utils';
import { writeFileSync } from 'fs';
import { renderToPdf } from './render';

const { electionDefinition } = electionFamousNames2021Fixtures;
const { election } = electionDefinition;

const testReportProps: AdminTallyReportByPartyProps = {
  title: 'North Lincoln Tally Report',
  isOfficial: false,
  isTest: false,
  isForLogicAndAccuracyTesting: false,
  electionDefinition,
  tallyReportResults: {
    contestIds: election.contests.map((c) => c.id),
    scannedResults: getEmptyElectionResults(election, true),
    hasPartySplits: false,
    cardCounts: getEmptyCardCounts(),
  },
  testId: 'test',
  generatedAtTime: new Date('2023-09-06T21:45:08'),
};

test('rendered tally report matches snapshot', async () => {
  const outputPath = tmpNameSync();
  await renderToPdf(<AdminTallyReportByParty {...testReportProps} />, {
    outputPath,
  });

  await expect(outputPath).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'single-page-tally-report',
  });
});

test('rendered tally report has minimum of the default height if using "expand to fit"', async () => {
  const outputPath = tmpNameSync();
  await renderToPdf(<AdminTallyReportByParty {...testReportProps} />, {
    outputPath,
    expandPageToFitContent: true,
  });

  await expect(outputPath).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'single-page-tally-report',
  });
});

function ManyHeadings({ count }: { count: number }): JSX.Element {
  return (
    <div>
      {Array.from({ length: count }, (_, i) => (
        <h1 key={i}>Item {i + 1}</h1>
      ))}
    </div>
  );
}

const PDF_SCALING = 200 / 72;

test('by default, large content is split across multiple letter pages', async () => {
  const outputPath = tmpNameSync();
  const pdfData = await renderToPdf(<ManyHeadings count={25} />);

  const pdf = await parsePdf(pdfData);
  expect(pdf.numPages).toEqual(2);
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const { height, width } = page.getViewport({ scale: 1 });
    expect(width * PDF_SCALING).toEqual(1700); // letter
    expect(height * PDF_SCALING).toEqual(2200); // letter
  }
  writeFileSync(outputPath, pdfData);
  await expect(outputPath).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'multiple-page-document',
  });
});

test('page can be longer than letter when using "expand to fit"', async () => {
  const outputPath = tmpNameSync();
  const pdfData = await renderToPdf(<ManyHeadings count={25} />, {
    outputPath,
    expandPageToFitContent: true,
  });

  const pdf = await parsePdf(pdfData);
  expect(pdf.numPages).toEqual(1);
  const { height, width } = (await pdf.getPage(1)).getViewport({ scale: 1 });
  expect(width * PDF_SCALING).toEqual(1700); // letter
  expect(height * PDF_SCALING).toBeGreaterThan(2200); // longer than letter
  await expect(outputPath).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'expand-to-fit-document',
  });
});

test('documents of various sizes all fit on a single page when using "expand to fit"', async () => {
  for (let i = 25; i <= 50; i += 1) {
    const pdfData = await renderToPdf(<ManyHeadings count={i} />, {
      expandPageToFitContent: true,
    });

    const pdf = await parsePdf(pdfData);
    expect(pdf.numPages).toEqual(1);
  }
});
