import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { buildSimpleMockTallyReportResults } from '@votingworks/utils';
import { render, screen, within } from '../../test/react_testing_library';
import { AdminTallyReportByParty } from './admin_tally_report_by_party';

test('general election, full election report', () => {
  const { election, electionDefinition } = electionFamousNames2021Fixtures;
  render(
    <AdminTallyReportByParty
      electionDefinition={electionDefinition}
      isOfficial
      isTest={false}
      testId="tally-report"
      generatedAtTime={new Date(2020, 0, 1, 0, 0, 0)}
      tallyReportResults={buildSimpleMockTallyReportResults({
        election,
        scannedBallotCount: 15,
      })}
    />
  );

  screen.getByTestId('tally-report');
  screen.getByText('Official Lincoln Municipal General Election Tally Report');
  screen.getByText(
    'This report was created on Wednesday, January 1, 2020 at 12:00:00 AM AKST.'
  );

  expect(screen.getByTestId('total-ballot-count')).toHaveTextContent('15');

  // expect all contests, with no manual results
  expect(screen.getAllByTestId(/results-table-/)).toHaveLength(
    election.contests.length
  );
  expect(screen.queryAllByTestId('contest-manual-results')).toHaveLength(0);
});

test('general election, precinct report with manual results', () => {
  const { election, electionDefinition } = electionFamousNames2021Fixtures;
  render(
    <AdminTallyReportByParty
      electionDefinition={electionDefinition}
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
    />
  );

  screen.getByTestId('tally-report');
  screen.getByText('Test Unofficial Precinct Tally Report');
  screen.getByText('Lincoln Municipal General Election');
  screen.getByText(
    'This report was created on Wednesday, January 1, 2020 at 12:00:00 AM AKST.'
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
    />
  );

  const mammalReport = screen.getByTestId('tally-report-0');
  within(mammalReport).getByText(
    'Official Mammal Party Example Primary Election Tally Report'
  );
  expect(
    within(mammalReport).getByTestId('total-ballot-count')
  ).toHaveTextContent('16');

  expect(within(mammalReport).getAllByTestId(/results-table-/)).toHaveLength(2);
  expect(
    within(mammalReport).queryAllByTestId('contest-manual-results')
  ).toHaveLength(2);

  const fishReport = screen.getByTestId('tally-report-1');
  within(fishReport).getByText(
    'Official Fish Party Example Primary Election Tally Report'
  );
  expect(
    within(fishReport).getByTestId('total-ballot-count')
  ).toHaveTextContent('0');

  expect(within(fishReport).getAllByTestId(/results-table-/)).toHaveLength(2);
  expect(
    within(fishReport).queryAllByTestId('contest-manual-results')
  ).toHaveLength(0);

  const nonpartisanReport = screen.getByTestId('tally-report-nonpartisan');
  within(nonpartisanReport).getByText(
    'Official Example Primary Election Nonpartisan Contests Tally Report'
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

test('primary election, party report', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  const { election } = electionDefinition;
  render(
    <AdminTallyReportByParty
      electionDefinition={electionDefinition}
      title="Mammal Party Tally Report"
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
    />
  );

  const mammalReport = screen.getByTestId('tally-report-0');
  within(mammalReport).getByText('Test Deck Mammal Party Tally Report');
  within(mammalReport).getByText('Mammal Party Example Primary Election');
  expect(
    within(mammalReport).getByTestId('total-ballot-count')
  ).toHaveTextContent('10');

  expect(within(mammalReport).getAllByTestId(/results-table-/)).toHaveLength(2);
  expect(
    within(mammalReport).queryAllByTestId('contest-manual-results')
  ).toHaveLength(0);

  const nonpartisanReport = screen.getByTestId('tally-report-nonpartisan');
  within(mammalReport).getByText('Test Deck Mammal Party Tally Report');
  within(nonpartisanReport).getByText(
    'Example Primary Election Nonpartisan Contests'
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
