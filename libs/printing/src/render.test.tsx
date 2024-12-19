import {
  getEmptyCardCounts,
  getEmptyElectionResults,
} from '@votingworks/utils';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  AdminTallyReportByParty,
  AdminTallyReportByPartyProps,
  P,
  useCurrentTheme,
} from '@votingworks/ui';
import { tmpNameSync } from 'tmp';
import { parsePdf } from '@votingworks/image-utils';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { err, iter } from '@votingworks/basics';
import { PAPER_DIMENSIONS, RenderSpec, renderToPdf } from './render';
import { OPTIONAL_EXECUTABLE_PATH_OVERRIDE } from './chromium';

const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();
const { election } = electionDefinition;

const FAILURE_THRESHOLD = 0.0001;
const testReportProps: AdminTallyReportByPartyProps = {
  title: 'North Lincoln Tally Report',
  isOfficial: false,
  isTest: false,
  isForLogicAndAccuracyTesting: false,
  electionDefinition,
  electionPackageHash: 'test-election-package-hash',
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
  (
    await renderToPdf({
      document: <AdminTallyReportByParty {...testReportProps} />,
      outputPath,
    })
  ).unsafeUnwrap();

  await expect(outputPath).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'single-page-tally-report',
    failureThreshold: FAILURE_THRESHOLD,
  });
});

test('rendered tally report has minimum of letter when size is LetterRoll', async () => {
  const outputPath = tmpNameSync();
  (
    await renderToPdf({
      document: <AdminTallyReportByParty {...testReportProps} />,
      outputPath,
      paperDimensions: PAPER_DIMENSIONS.LetterRoll,
    })
  ).unsafeUnwrap();

  await expect(outputPath).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'single-page-tally-report',
    failureThreshold: FAILURE_THRESHOLD,
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
  const pdfData = (
    await renderToPdf({ document: <ManyHeadings count={25} /> })
  ).unsafeUnwrap();

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

test('page can be longer than letter when using LetterRoll', async () => {
  const outputPath = tmpNameSync();
  const pdfData = (
    await renderToPdf({
      document: <ManyHeadings count={25} />,
      outputPath,
      paperDimensions: PAPER_DIMENSIONS.LetterRoll,
    })
  ).unsafeUnwrap();

  const pdf = await parsePdf(pdfData);
  expect(pdf.numPages).toEqual(1);
  const { height, width } = (await pdf.getPage(1)).getViewport({ scale: 1 });
  expect(width * PDF_SCALING).toEqual(1700); // letter
  expect(height * PDF_SCALING).toBeGreaterThan(2200); // longer than letter
  await expect(outputPath).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'roll-document',
  });
});

test('page can not be longer than 100 inches when using LetterRoll', async () => {
  const outputPath = tmpNameSync();
  const pdfData = (
    await renderToPdf({
      document: <ManyHeadings count={500} />,
      outputPath,
      paperDimensions: PAPER_DIMENSIONS.LetterRoll,
    })
  ).unsafeUnwrap();

  const pdf = await parsePdf(pdfData);
  expect(pdf.numPages).toEqual(3);
  const { height, width } = (await pdf.getPage(1)).getViewport({ scale: 1 });
  expect(width * PDF_SCALING).toEqual(1700); // letter
  expect(height * PDF_SCALING).toEqual(20000); // maximum length
});

test('bmd 150 page is 13.25"', async () => {
  const outputPath = tmpNameSync();
  const pdfData = (
    await renderToPdf({
      document: <ManyHeadings count={15} />,
      outputPath,
      paperDimensions: PAPER_DIMENSIONS.Bmd150,
    })
  ).unsafeUnwrap();

  const pdf = await parsePdf(pdfData);
  expect(pdf.numPages).toEqual(1);
  const { height, width } = (await pdf.getPage(1)).getViewport({ scale: 1 });
  // Setting with to exactly 1600 overflows the line and causes a blank line
  // to be printed after each actual line.
  expect(width * PDF_SCALING).toBeLessThan(1600);
  expect(width * PDF_SCALING).toBeGreaterThan(1595);

  expect(height * PDF_SCALING).toEqual(2650); // (13.25in / 11in) * 2200
  await expect(outputPath).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'bmd-150-document',
  });
});

test('can render multiple documents at once', async () => {
  const outputPath1 = tmpNameSync();
  const outputPath2 = tmpNameSync();
  (
    await renderToPdf([
      {
        document: <AdminTallyReportByParty {...testReportProps} />,
        outputPath: outputPath1,
      },
      {
        document: <ManyHeadings count={25} />,
        paperDimensions: PAPER_DIMENSIONS.LetterRoll,
        outputPath: outputPath2,
      },
    ])
  ).unsafeUnwrap();

  await expect(outputPath1).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'single-page-tally-report',
    failureThreshold: FAILURE_THRESHOLD,
  });
  await expect(outputPath2).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'roll-document',
    failureThreshold: FAILURE_THRESHOLD,
  });
});

test('documents of various sizes all fit on a single page when using LetterRoll', async () => {
  const specs: RenderSpec[] = [];
  for (let i = 25; i <= 50; i += 1) {
    specs.push({
      document: <ManyHeadings count={i} />,
      paperDimensions: PAPER_DIMENSIONS.LetterRoll,
    });
  }

  const pdfData = (await renderToPdf(specs)).unsafeUnwrap();
  const pdfs = await Promise.all(pdfData.map((data) => parsePdf(data)));
  expect(pdfs.every((pdf) => pdf.numPages === 1)).toEqual(true);
});

test('renders with custom margins', async () => {
  const outputPath = tmpNameSync();
  (
    await renderToPdf({
      document: <AdminTallyReportByParty {...testReportProps} />,
      outputPath,
      marginDimensions: { top: 0, right: 0, bottom: 0, left: 0 },
    })
  ).unsafeUnwrap();

  await expect(outputPath).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'no-margins',
  });
});

test('with browser override', async () => {
  const browserOverride = await chromium.launch({
    args: ['--font-render-hinting=none'],
    executablePath: OPTIONAL_EXECUTABLE_PATH_OVERRIDE,
  });

  const outputPath = tmpNameSync();
  (
    await renderToPdf(
      {
        document: <div>with browser override</div>,
        outputPath,
      },
      browserOverride
    )
  ).unsafeUnwrap();

  await expect(outputPath).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'with-browser-override',
  });

  await browserOverride.close();
});

test('uses print theme when specified', async () => {
  function LegacyThemeComponent() {
    const theme = useCurrentTheme();
    expect(theme.colorMode).toEqual('desktop');
    expect(theme.sizeMode).toEqual('desktop');

    return <P>legacy theme</P>;
  }
  (await renderToPdf({ document: <LegacyThemeComponent /> })).unsafeUnwrap();

  function PrintThemeComponent() {
    const theme = useCurrentTheme();
    expect(theme.colorMode).toEqual('print');
    expect(theme.sizeMode).toEqual('print');

    return <P>print theme</P>;
  }
  (
    await renderToPdf({
      document: <PrintThemeComponent />,
      usePrintTheme: true,
    })
  ).unsafeUnwrap();
});

test('errors if the document is too large', async () => {
  expect(
    await renderToPdf({
      document: <div>{iter('x').cycle().take(10_000_001).toString()}</div>,
    })
  ).toEqual(err('content-too-large'));
});
