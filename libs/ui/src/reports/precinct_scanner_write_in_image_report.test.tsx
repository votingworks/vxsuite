import { expect, test, vi } from 'vitest';
import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { PAPER_DIMENSIONS, renderToPdf } from '@votingworks/printing';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { render, screen } from '../../test/react_testing_library';
import {
  ContestWriteIns,
  PrecinctScannerWriteInImageReport,
} from './precinct_scanner_write_in_image_report';

vi.mock(import('@votingworks/types'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    formatElectionHashes: vi.fn().mockReturnValue('1111111-0000000'),
  };
});

const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

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

test('renders contest heading with inline write-in count', () => {
  const contestWriteIns: ContestWriteIns[] = [
    {
      contestId: 'mayor',
      contestName: 'Mayor',
      writeIns: [
        { type: 'image', dataUrl: 'data:image/png;base64,abc' },
        { type: 'image', dataUrl: 'data:image/png;base64,def' },
        { type: 'text', text: 'Jane Doe' },
      ],
    },
  ];

  render(
    PrecinctScannerWriteInImageReport({ ...DEFAULT_PROPS, contestWriteIns })
  );

  const heading = screen.getByRole('heading', { level: 2 });
  expect(heading.textContent).toContain('Mayor');
  expect(heading.textContent).toContain('3');

  // Renders All Precincts heading
  screen.getByText(/All Precincts/);
});

test('renders image write-ins as img elements', () => {
  const contestWriteIns: ContestWriteIns[] = [
    {
      contestId: 'mayor',
      contestName: 'Mayor',
      writeIns: [{ type: 'image', dataUrl: 'data:image/png;base64,testimage' }],
    },
  ];

  render(
    PrecinctScannerWriteInImageReport({
      ...DEFAULT_PROPS,
      contestWriteIns,
      precinctSelection: singlePrecinctSelectionFor(
        electionDefinition.election.precincts[0].id
      ),
    })
  );

  const img = screen.getByAltText('Write-in for Mayor');
  expect(img.getAttribute('src')).toEqual('data:image/png;base64,testimage');
  screen.getByText(new RegExp(electionDefinition.election.precincts[0].name));
});

test('renders text write-ins with "Summary Ballot Write-In" label', () => {
  const contestWriteIns: ContestWriteIns[] = [
    {
      contestId: 'mayor',
      contestName: 'Mayor',
      writeIns: [{ type: 'text', text: 'Mickey Mouse' }],
    },
  ];

  render(
    PrecinctScannerWriteInImageReport({ ...DEFAULT_PROPS, contestWriteIns })
  );

  screen.getByText('Summary Ballot Write-In');
  screen.getByText('Mickey Mouse');
});

test('renders contests with 0 write-ins without a grid', () => {
  const contestWriteIns: ContestWriteIns[] = [
    {
      contestId: 'mayor',
      contestName: 'Mayor',
      writeIns: [],
    },
    {
      contestId: 'controller',
      contestName: 'Controller',
      writeIns: [
        { type: 'text', text: 'Alice' },
        { type: 'text', text: 'Bob' },
      ],
    },
  ];

  render(
    PrecinctScannerWriteInImageReport({ ...DEFAULT_PROPS, contestWriteIns })
  );

  screen.getByText(/Mayor/);
  screen.getByText(/Controller/);
  screen.getByText('Alice');
  screen.getByText('Bob');
});

test('intermixes image and text entries in a single grid', () => {
  const contestWriteIns: ContestWriteIns[] = [
    {
      contestId: 'mayor',
      contestName: 'Mayor',
      writeIns: [
        { type: 'image', dataUrl: 'data:image/png;base64,img1' },
        { type: 'text', text: 'Jane Doe' },
        { type: 'image', dataUrl: 'data:image/png;base64,img2' },
      ],
    },
  ];

  const { container } = render(
    PrecinctScannerWriteInImageReport({ ...DEFAULT_PROPS, contestWriteIns })
  );

  const images = container.querySelectorAll('img[alt="Write-in for Mayor"]');
  expect(images).toHaveLength(2);
  screen.getByText('Jane Doe');
});

test('shows test mode banner when not in live mode', () => {
  const contestWriteIns: ContestWriteIns[] = [];

  render(
    PrecinctScannerWriteInImageReport({
      ...DEFAULT_PROPS,
      isLiveMode: false,
      contestWriteIns,
    })
  );

  screen.getByText('Test Report');
});

test('does not show test mode banner in live mode', () => {
  const contestWriteIns: ContestWriteIns[] = [];

  render(
    PrecinctScannerWriteInImageReport({
      ...DEFAULT_PROPS,
      isLiveMode: true,
      contestWriteIns,
    })
  );

  expect(screen.queryByText('Test Report')).toBeNull();
});

test('renders multiple contests in order', () => {
  const contestWriteIns: ContestWriteIns[] = [
    {
      contestId: 'mayor',
      contestName: 'Mayor',
      writeIns: [{ type: 'text', text: 'Alice' }],
    },
    {
      contestId: 'controller',
      contestName: 'Controller',
      writeIns: [],
    },
    {
      contestId: 'attorney',
      contestName: 'Attorney',
      writeIns: [
        { type: 'text', text: 'Bob' },
        { type: 'text', text: 'Charlie' },
      ],
    },
  ];

  render(
    PrecinctScannerWriteInImageReport({ ...DEFAULT_PROPS, contestWriteIns })
  );

  const headings = screen.getAllByRole('heading', { level: 2 });
  expect(headings[0].textContent).toContain('Mayor');
  expect(headings[1].textContent).toContain('Controller');
  expect(headings[2].textContent).toContain('Attorney');
});

test('renders party headers for primary elections', () => {
  const primaryElectionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();

  const contestWriteIns: ContestWriteIns[] = [
    {
      contestId: 'zoo-council-mammal',
      contestName: 'Zoo Council',
      partyId: '0',
      writeIns: [{ type: 'text', text: 'Elephant' }],
    },
    {
      contestId: 'aquarium-council-fish',
      contestName: 'Aquarium Council',
      partyId: '1',
      writeIns: [{ type: 'text', text: 'Salmon' }],
    },
  ];

  render(
    PrecinctScannerWriteInImageReport({
      electionDefinition: primaryElectionDefinition,
      electionPackageHash: 'test-package-hash',
      precinctSelection: ALL_PRECINCTS_SELECTION,
      isLiveMode: true,
      reportPrintedTime: REPORT_PRINTED_TIME,
      precinctScannerMachineId: 'SC-00-000',
      contestWriteIns,
    })
  );

  screen.getByText('Mammal Party');
  screen.getByText('Fish Party');
  screen.getByText(/Zoo Council/);
  screen.getByText(/Aquarium Council/);
});

test('does not render party headers for general elections', () => {
  const contestWriteIns: ContestWriteIns[] = [
    {
      contestId: 'mayor',
      contestName: 'Mayor',
      writeIns: [{ type: 'text', text: 'Alice' }],
    },
  ];

  render(
    PrecinctScannerWriteInImageReport({ ...DEFAULT_PROPS, contestWriteIns })
  );

  screen.getByText(/Mayor/);
  // No party headers should be rendered
  expect(screen.queryByText('Mammal Party')).toBeNull();
  expect(screen.queryByText('Fish Party')).toBeNull();
});

function makePlaceholderImageDataUrl(width: number, height: number): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect width="100%" height="100%" fill="#e0e0e0"/>` +
      `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="sans-serif" font-size="14" fill="#666">` +
      `Write-in area ${width}x${height}` +
      `</text></svg>`
  )}`;
}

test('pdf snapshot - general election with write-ins', async () => {
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
    failureThreshold: 0.01, // Allow small differences due to font rendering
  });
});

test('pdf snapshot - empty report', async () => {
  const { election } = electionDefinition;

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
    failureThreshold: 0.01, // Allow small differences due to font rendering
  });
});

test('pdf snapshot - primary election with party headers', async () => {
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
    failureThreshold: 0.01, // Allow small differences due to font rendering
  });
});
