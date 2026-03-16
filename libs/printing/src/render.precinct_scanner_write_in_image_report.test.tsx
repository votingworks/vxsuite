import { expect, test, vi } from 'vitest';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  ContestWriteIns,
  PrecinctScannerWriteInImageReport,
} from '@votingworks/ui';
import { PAPER_DIMENSIONS, renderToPdf } from './render';

vi.mock(import('@votingworks/types'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    formatElectionHashes: vi.fn().mockReturnValue('1111111-0000000'),
  };
});

const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();
const { election } = electionDefinition;

const REPORT_PRINTED_TIME = new Date('2021-01-01T00:00:00.000').getTime();

const DEFAULT_PROPS: Omit<
  Parameters<typeof PrecinctScannerWriteInImageReport>[0],
  'contestWriteIns'
> = {
  electionDefinition,
  electionPackageHash: 'test-package-hash',
  precinctSelection: ALL_PRECINCTS_SELECTION,
  isLiveMode: true,
  reportPrintedTime: REPORT_PRINTED_TIME,
  precinctScannerMachineId: 'SC-00-000',
};

function makePlaceholderImageDataUrl(width: number, height: number): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect width="100%" height="100%" fill="#e0e0e0"/>` +
      `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="sans-serif" font-size="14" fill="#000000">` +
      `Write-in area ${width}x${height}` +
      `</text></svg>`
  )}`;
}

test('general election with write-ins', async () => {
  const contestWriteIns: ContestWriteIns[] = [
    {
      contestId: 'mayor',
      contestName: 'Mayor',
      writeIns: [
        { type: 'image', dataUrl: makePlaceholderImageDataUrl(400, 80) },
        { type: 'image', dataUrl: makePlaceholderImageDataUrl(400, 80) },
        { type: 'text', text: 'Jane Doe' },
      ],
    },
    {
      contestId: 'controller',
      contestName: 'Controller',
      writeIns: [
        { type: 'image', dataUrl: makePlaceholderImageDataUrl(400, 80) },
      ],
    },
    {
      contestId: 'attorney',
      contestName: 'Attorney',
      writeIns: [],
    },
    {
      contestId: 'public-works-director',
      contestName: 'Public Works Director',
      writeIns: [],
    },
    {
      contestId: 'chief-of-police',
      contestName: 'Chief of Police',
      writeIns: [],
    },
    {
      contestId: 'parks-and-recreation-director',
      contestName: 'Parks and Recreation Director',
      writeIns: [],
    },
    {
      contestId: 'board-of-alderman',
      contestName: 'Board of Alderman',
      writeIns: [
        { type: 'image', dataUrl: makePlaceholderImageDataUrl(400, 80) },
        { type: 'image', dataUrl: makePlaceholderImageDataUrl(400, 80) },
        { type: 'image', dataUrl: makePlaceholderImageDataUrl(400, 80) },
        { type: 'text', text: 'Alice Smith' },
        { type: 'text', text: 'Bob Johnson' },
      ],
    },
    {
      contestId: 'city-council',
      contestName: 'City Council',
      writeIns: [],
    },
  ];

  const report = PrecinctScannerWriteInImageReport({
    ...DEFAULT_PROPS,
    contestWriteIns,
  });

  const pdf = (
    await renderToPdf({
      document: report,
      paperDimensions: PAPER_DIMENSIONS.LetterRoll,
    })
  ).unsafeUnwrap();

  await expect(pdf).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'write-in-image-report',
    failureThreshold: 0.01,
  });
});

test('empty write-in report', async () => {
  const contestWriteIns: ContestWriteIns[] = election.contests
    .filter((c) => c.type === 'candidate' && c.allowWriteIns)
    .map((c) => ({
      contestId: c.id,
      contestName: c.title,
      writeIns: [],
    }));

  const report = PrecinctScannerWriteInImageReport({
    ...DEFAULT_PROPS,
    isLiveMode: false,
    contestWriteIns,
  });

  const pdf = (
    await renderToPdf({
      document: report,
      paperDimensions: PAPER_DIMENSIONS.LetterRoll,
    })
  ).unsafeUnwrap();

  await expect(pdf).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'write-in-image-report-empty',
    failureThreshold: 0.01,
  });
});

test('primary election with party headers', async () => {
  const primaryElectionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();

  const contestWriteIns: ContestWriteIns[] = [
    {
      contestId: 'zoo-council-mammal',
      contestName: 'Zoo Council',
      partyId: '0',
      writeIns: [
        { type: 'text', text: 'Elephant' },
        { type: 'image', dataUrl: makePlaceholderImageDataUrl(400, 80) },
      ],
    },
    {
      contestId: 'aquarium-council-fish',
      contestName: 'Aquarium Council',
      partyId: '1',
      writeIns: [{ type: 'text', text: 'Salmon' }],
    },
  ];

  const report = PrecinctScannerWriteInImageReport({
    electionDefinition: primaryElectionDefinition,
    electionPackageHash: 'test-package-hash',
    precinctSelection: singlePrecinctSelectionFor(
      primaryElectionDefinition.election.precincts[0].id
    ),
    isLiveMode: true,
    reportPrintedTime: REPORT_PRINTED_TIME,
    precinctScannerMachineId: 'SC-00-000',
    contestWriteIns,
  });

  const pdf = (
    await renderToPdf({
      document: report,
      paperDimensions: PAPER_DIMENSIONS.LetterRoll,
    })
  ).unsafeUnwrap();

  await expect(pdf).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'write-in-image-report-primary',
    failureThreshold: 0.01,
  });
});
