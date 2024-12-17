import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import {
  buildElectionResultsFixture,
  buildManualResultsFixture,
  getEmptyElectionResults,
} from '@votingworks/utils';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { formatElectionHashes } from '@votingworks/types';
import { render, screen, within } from '../../test/react_testing_library';
import { AdminTallyReport } from './admin_tally_report';
import { mockScannerBatches } from '../../test/fixtures';

const electionDefinition = readElectionTwoPartyPrimaryDefinition();
const { election } = electionDefinition;

function queryForContest(contestId: string) {
  return screen.queryByTestId(`results-table-${contestId}`);
}

test('includes indicated contests', () => {
  // all contests but first
  const [excludedContest, ...includedContests] = election.contests;
  render(
    <AdminTallyReport
      title="Title"
      isOfficial={false}
      isTest={false}
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      contests={includedContests}
      scannedElectionResults={getEmptyElectionResults(election, true)}
    />
  );

  for (const contest of includedContests) {
    expect(queryForContest(contest.id)).toBeInTheDocument();
  }
  expect(queryForContest(excludedContest.id)).not.toBeInTheDocument();
});

test('test mode banner', () => {
  render(
    <AdminTallyReport
      title="Title"
      isOfficial={false}
      isTest
      electionDefinition={electionDefinition}
      contests={election.contests}
      scannedElectionResults={getEmptyElectionResults(election, true)}
    />
  );
  screen.getByText('Test Report');
});

test('titles', () => {
  const testCases: Array<{
    isOfficial: boolean;
    isForLogicAndAccuracyTesting?: boolean;
    expectedTitle: string;
  }> = [
    {
      isOfficial: true,
      expectedTitle: 'Official Title',
    },
    {
      isOfficial: false,
      expectedTitle: 'Unofficial Title',
    },
    {
      isOfficial: false,
      isForLogicAndAccuracyTesting: true,
      expectedTitle: 'Test Deck Title',
    },
  ];
  for (const {
    isOfficial,
    isForLogicAndAccuracyTesting,
    expectedTitle,
  } of testCases) {
    const { unmount } = render(
      <AdminTallyReport
        title="Title"
        isTest={false}
        isOfficial={isOfficial}
        isForLogicAndAccuracyTesting={isForLogicAndAccuracyTesting}
        electionDefinition={electionDefinition}
        electionPackageHash="test-election-package-hash"
        contests={election.contests}
        scannedElectionResults={getEmptyElectionResults(election, true)}
      />
    );
    screen.getByRole('heading', { name: expectedTitle });
    expect(screen.queryByText('Test Report')).not.toBeInTheDocument();
    unmount();
  }
});

test('includes election info and report metadata', () => {
  render(
    <AdminTallyReport
      title="Title"
      isOfficial={false}
      isTest={false}
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      contests={election.contests}
      scannedElectionResults={getEmptyElectionResults(election, true)}
      generatedAtTime={new Date(2020, 0, 1, 0, 0, 0)}
    />
  );
  screen.getByText(
    'Example Primary Election, Sep 8, 2021, Sample County, State of Sample'
  );
  screen.getByText(
    hasTextAcrossElements('Report Generated: Jan 1, 2020, 12:00 AM')
  );
  screen.getByText(
    hasTextAcrossElements(
      `Election ID: ${formatElectionHashes(
        electionDefinition.ballotHash,
        'test-election-package-hash'
      )}`
    )
  );
});

const scannedElectionResults = buildElectionResultsFixture({
  election,
  cardCounts: {
    bmd: 790,
    hmpb: [],
  },
  contestResultsSummaries: {
    fishing: {
      type: 'yesno',
      ballots: 791,
      overvotes: 3,
      undervotes: 88,
      yesTally: 550,
      noTally: 150,
    },
  },
  includeGenericWriteIn: true,
});

test('with only scanned results', () => {
  render(
    <AdminTallyReport
      title="Title"
      isOfficial={false}
      isTest={false}
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      contests={election.contests}
      scannedElectionResults={scannedElectionResults}
    />
  );
  screen.getByText(/791 ballots cast/);
  expect(screen.getAllByText(/0 ballots cast/)).toHaveLength(
    election.contests.length - 1
  );

  expect(screen.queryAllByText('manual')).toHaveLength(0);
});

const manualElectionResults = buildManualResultsFixture({
  election,
  ballotCount: 100,
  contestResultsSummaries: {
    fishing: {
      type: 'yesno',
      ballots: 100,
      overvotes: 0,
      undervotes: 0,
      yesTally: 50,
      noTally: 50,
    },
  },
});

test('with scanned and manual results', () => {
  render(
    <AdminTallyReport
      title="Title"
      isOfficial={false}
      isTest={false}
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      contests={election.contests}
      scannedElectionResults={scannedElectionResults}
      manualElectionResults={manualElectionResults}
    />
  );
  screen.getByText(hasTextAcrossElements('Ballots Cast791100891'));
  expect(screen.getAllByText('manual')).toHaveLength(election.contests.length);
});

test('allows card counts override', () => {
  render(
    <AdminTallyReport
      title="Title"
      isOfficial={false}
      isTest={false}
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      contests={election.contests}
      scannedElectionResults={scannedElectionResults}
      cardCountsOverride={{
        bmd: 10000,
        hmpb: [],
      }}
    />
  );
  const bmdRow = screen.getByText('Machine Marked').closest('tr')!;
  within(bmdRow).getByText('10,000');
});

test('displays custom filter', () => {
  render(
    <AdminTallyReport
      title="Title"
      isOfficial={false}
      isTest={false}
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      contests={election.contests}
      scannedElectionResults={scannedElectionResults}
      cardCountsOverride={{
        bmd: 10000,
        hmpb: [],
      }}
      customFilter={{ precinctIds: ['precinct-1'] }}
      scannerBatches={mockScannerBatches}
    />
  );
  screen.getByText(hasTextAcrossElements('Precinct: Precinct 1'));
});

test('displays signature lines', () => {
  render(
    <AdminTallyReport
      title="Title"
      isOfficial={false}
      isTest={false}
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      contests={election.contests}
      scannedElectionResults={scannedElectionResults}
      cardCountsOverride={{
        bmd: 10000,
        hmpb: [],
      }}
      includeSignatureLines
    />
  );
  screen.getByText('Certification Signatures:');
});
