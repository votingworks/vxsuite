import {
  electionFamousNames2021Fixtures,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { buildSimpleMockTallyReportResults } from '@votingworks/utils';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { formatBallotHash } from '@votingworks/types';
import { render, screen, within } from '../../test/react_testing_library';
import { AdminTallyReportByParty } from './admin_tally_report_by_party';
import { mockScannerBatches } from '../../test/fixtures';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

test('general election, full election report', () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { election } = electionDefinition;
  render(
    <AdminTallyReportByParty
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      isOfficial
      isTest={false}
      testId="tally-report"
      generatedAtTime={new Date(2020, 0, 1, 0, 0, 0)}
      tallyReportResults={buildSimpleMockTallyReportResults({
        election,
        scannedBallotCount: 15,
      })}
      scannerBatches={mockScannerBatches}
    />
  );

  screen.getByTestId('tally-report');
  screen.getByText('Official Tally Report');
  screen.getByText(
    'Lincoln Municipal General Election, Jun 6, 2021, Franklin County, State of Hamilton'
  );
  screen.getByText(
    hasTextAcrossElements('Report Generated: Jan 1, 2020, 12:00 AM')
  );

  expect(screen.getByTestId('total-ballot-count')).toHaveTextContent('15');

  // expect all contests, with no manual results
  expect(screen.getAllByTestId(/results-table-/)).toHaveLength(
    election.contests.length
  );
  expect(screen.queryAllByTestId('contest-manual-results')).toHaveLength(0);
});

test('general election, precinct report with manual results', () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { election } = electionDefinition;
  render(
    <AdminTallyReportByParty
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      isOfficial={false}
      isTest
      title="Precinct Tally Report"
      testId="tally-report"
      generatedAtTime={new Date(2020, 0, 1, 0, 0, 0)}
      tallyReportResults={buildSimpleMockTallyReportResults({
        election,
        scannedBallotCount: 15,
        manualBallotCount: 1,
      })}
      scannerBatches={mockScannerBatches}
    />
  );

  screen.getByTestId('tally-report');
  screen.getByText('Unofficial Precinct Tally Report');
  screen.getByText(
    'Lincoln Municipal General Election, Jun 6, 2021, Franklin County, State of Hamilton'
  );
  screen.getByText(
    hasTextAcrossElements('Report Generated: Jan 1, 2020, 12:00 AM')
  );

  expect(screen.getByTestId('total-ballot-count')).toHaveTextContent('16');

  // expect all contests with manual results
  expect(screen.getAllByTestId(/results-table-/)).toHaveLength(
    election.contests.length
  );
  expect(screen.queryAllByTestId('contest-manual-results')).toHaveLength(
    election.contests.length
  );
});

test('primary election, full election report with manual results', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  const { election } = electionDefinition;
  render(
    <AdminTallyReportByParty
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      isOfficial
      isTest={false}
      testId="tally-report"
      generatedAtTime={new Date('2020-01-01')}
      tallyReportResults={buildSimpleMockTallyReportResults({
        election,
        scannedBallotCount: 15,
        manualBallotCount: 1,
        cardCountsByParty: {
          '0': {
            bmd: 15,
            hmpb: [],
            manual: 1,
          },
        },
      })}
      scannerBatches={mockScannerBatches}
    />
  );

  const mammalReport = screen.getByTestId('tally-report-0');
  within(mammalReport).getByText('Official Tally Report');
  within(mammalReport).getByText('Mammal Party');
  within(mammalReport).getByText(
    'Example Primary Election, Sep 8, 2021, Sample County, State of Sample'
  );
  expect(
    within(mammalReport).getByTestId('total-ballot-count')
  ).toHaveTextContent('16');

  expect(within(mammalReport).getAllByTestId(/results-table-/)).toHaveLength(2);
  expect(
    within(mammalReport).queryAllByTestId('contest-manual-results')
  ).toHaveLength(2);

  const fishReport = screen.getByTestId('tally-report-1');
  within(fishReport).getByText('Official Tally Report');
  within(fishReport).getByText('Fish Party');
  within(fishReport).getByText(
    'Example Primary Election, Sep 8, 2021, Sample County, State of Sample'
  );
  expect(
    within(fishReport).getByTestId('total-ballot-count')
  ).toHaveTextContent('0');

  expect(within(fishReport).getAllByTestId(/results-table-/)).toHaveLength(2);
  expect(
    within(fishReport).queryAllByTestId('contest-manual-results')
  ).toHaveLength(0);

  const nonpartisanReport = screen.getByTestId('tally-report-nonpartisan');
  within(nonpartisanReport).getByText('Official Tally Report');
  within(nonpartisanReport).getByText('Nonpartisan Contests');
  within(nonpartisanReport).getByText(
    'Example Primary Election, Sep 8, 2021, Sample County, State of Sample'
  );
  expect(
    within(nonpartisanReport).getByTestId('total-ballot-count')
  ).toHaveTextContent('16'); // should combine results

  expect(
    within(nonpartisanReport).getAllByTestId(/results-table-/)
  ).toHaveLength(3);
  expect(
    within(nonpartisanReport).queryAllByTestId('contest-manual-results')
  ).toHaveLength(3);
});

test('primary election, party report, test deck', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  const { election } = electionDefinition;
  render(
    <AdminTallyReportByParty
      electionDefinition={electionDefinition}
      title="Title Override"
      isOfficial={false}
      isTest
      isForLogicAndAccuracyTesting
      testId="tally-report"
      generatedAtTime={new Date('2020-01-01')}
      tallyReportResults={buildSimpleMockTallyReportResults({
        election,
        scannedBallotCount: 10,
        cardCountsByParty: {
          '0': 10,
        },
        contestIds: election.contests
          .filter((c) => c.type === 'yesno' || c.partyId === '0')
          .map((c) => c.id),
      })}
      scannerBatches={mockScannerBatches}
    />
  );

  const mammalReport = screen.getByTestId('tally-report-0');
  within(mammalReport).getByText('Test Deck Title Override');
  within(mammalReport).getByText('Mammal Party');
  within(mammalReport).getByText(
    'Example Primary Election, Sep 8, 2021, Sample County, State of Sample'
  );
  expect(
    within(mammalReport).getByTestId('total-ballot-count')
  ).toHaveTextContent('10');
  within(mammalReport).getByText(
    hasTextAcrossElements(
      `Election ID: ${formatBallotHash(electionDefinition.ballotHash)}`
    )
  );

  expect(within(mammalReport).getAllByTestId(/results-table-/)).toHaveLength(2);
  expect(
    within(mammalReport).queryAllByTestId('contest-manual-results')
  ).toHaveLength(0);

  const nonpartisanReport = screen.getByTestId('tally-report-nonpartisan');
  within(nonpartisanReport).getByText('Test Deck Title Override');
  within(nonpartisanReport).getByText('Nonpartisan Contests');
  within(nonpartisanReport).getByText(
    'Example Primary Election, Sep 8, 2021, Sample County, State of Sample'
  );
  within(nonpartisanReport).getByText(
    hasTextAcrossElements(
      `Election ID: ${formatBallotHash(electionDefinition.ballotHash)}`
    )
  );
  expect(
    within(nonpartisanReport).getByTestId('total-ballot-count')
  ).toHaveTextContent('10'); // should combine results

  expect(
    within(nonpartisanReport).getAllByTestId(/results-table-/)
  ).toHaveLength(3);
  expect(
    within(nonpartisanReport).queryAllByTestId('contest-manual-results')
  ).toHaveLength(0);

  // there should only be the two pages
  expect(screen.getAllByTestId(/tally-report/)).toHaveLength(2);
});
