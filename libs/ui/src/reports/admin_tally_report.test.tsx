import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import {
  buildElectionResultsFixture,
  buildManualResultsFixture,
  getEmptyElectionResults,
} from '@votingworks/utils';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { render, screen, within } from '../../test/react_testing_library';
import { AdminTallyReport } from './admin_tally_report';

const electionDefinition = electionMinimalExhaustiveSampleDefinition;
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
      electionDefinition={electionDefinition}
      contests={includedContests}
      scannedElectionResults={getEmptyElectionResults(election, true)}
    />
  );

  for (const contest of includedContests) {
    expect(queryForContest(contest.id)).toBeInTheDocument();
  }
  expect(queryForContest(excludedContest.id)).not.toBeInTheDocument();
});

test('includes subtitle', () => {
  render(
    <AdminTallyReport
      title="Title"
      subtitle="Subtitle"
      electionDefinition={electionDefinition}
      contests={election.contests}
      scannedElectionResults={getEmptyElectionResults(election, true)}
    />
  );
  screen.getByRole('heading', { name: 'Title' });
  screen.getByRole('heading', { name: 'Subtitle' });
});

test('includes specified date', () => {
  render(
    <AdminTallyReport
      title="Title"
      subtitle="Subtitle"
      electionDefinition={electionDefinition}
      contests={election.contests}
      scannedElectionResults={getEmptyElectionResults(election, true)}
      generatedAtTime={new Date('2020-01-01')}
    />
  );
  screen.getByText(
    'This report was created on Wednesday, January 1, 2020 at 12:00:00 AM UTC.'
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
      subtitle="Subtitle"
      electionDefinition={electionDefinition}
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
      subtitle="Subtitle"
      electionDefinition={electionDefinition}
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
      subtitle="Subtitle"
      electionDefinition={electionDefinition}
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
      subtitle="Subtitle"
      electionDefinition={electionDefinition}
      contests={election.contests}
      scannedElectionResults={scannedElectionResults}
      cardCountsOverride={{
        bmd: 10000,
        hmpb: [],
      }}
      customFilter={{ precinctIds: ['precinct-1'] }}
    />
  );
  screen.getByText(hasTextAcrossElements('Precinct: Precinct 1'));
});
