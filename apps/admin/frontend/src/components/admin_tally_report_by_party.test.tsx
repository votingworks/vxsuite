import React from 'react';
import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import { render, screen, within } from '../../test/react_testing_library';
import { AdminTallyReportByParty } from './admin_tally_report_by_party';
import { getSimpleMockTallyResults } from '../../test/helpers/mock_results';

test('general election, full election report', () => {
  const { election } = electionFamousNames2021Fixtures;
  render(
    <AdminTallyReportByParty
      election={election}
      contests={election.contests}
      tallyReportType="Official"
      testId="tally-report"
      generatedAtTime={new Date('2020-01-01')}
      tallyReportResults={[getSimpleMockTallyResults(election, 15)]}
    />
  );

  screen.getByTestId('tally-report');
  screen.getByText('Official Lincoln Municipal General Election Tally Report');
  screen.getByText(
    'This report was created on Wednesday, January 1, 2020 at 12:00:00 AM UTC.'
  );

  expect(screen.getByTestId('total-ballot-count')).toHaveTextContent('15');

  // expect all contests, with no manual results
  expect(screen.getAllByTestId(/results-table-/)).toHaveLength(
    election.contests.length
  );
  expect(screen.queryAllByTestId('contest-manual-results')).toHaveLength(0);
});

test('general election, precinct report with manual results', () => {
  const { election } = electionFamousNames2021Fixtures;
  render(
    <AdminTallyReportByParty
      election={election}
      contests={election.contests}
      tallyReportType="Unofficial"
      title="Precinct Tally Report"
      testId="tally-report"
      generatedAtTime={new Date('2020-01-01')}
      tallyReportResults={[getSimpleMockTallyResults(election, 15, 1)]}
    />
  );

  screen.getByTestId('tally-report');
  screen.getByText('Unofficial Precinct Tally Report');
  screen.getByText('Lincoln Municipal General Election');
  screen.getByText(
    'This report was created on Wednesday, January 1, 2020 at 12:00:00 AM UTC.'
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
  const { election } = electionMinimalExhaustiveSampleDefinition;
  render(
    <AdminTallyReportByParty
      election={election}
      contests={election.contests}
      tallyReportType="Official"
      testId="tally-report"
      generatedAtTime={new Date('2020-01-01')}
      tallyReportResults={[
        {
          partyId: '0',
          ...getSimpleMockTallyResults(election, 15, 1),
        },
        {
          partyId: '1',
          ...getSimpleMockTallyResults(election, 10),
        },
      ]}
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
  ).toHaveTextContent('10');

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
  ).toHaveTextContent('26'); // should combine results

  expect(
    within(nonpartisanReport).getAllByTestId(/results-table-/)
  ).toHaveLength(3);
  expect(
    within(nonpartisanReport).queryAllByTestId('contest-manual-results')
  ).toHaveLength(3);
});

test('primary election, party report', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;
  render(
    <AdminTallyReportByParty
      election={election}
      contests={election.contests.filter(
        (c) => c.type === 'yesno' || c.partyId === '0'
      )}
      title="Mammal Party Tally Report"
      tallyReportType="Official"
      testId="tally-report"
      generatedAtTime={new Date('2020-01-01')}
      tallyReportResults={[
        {
          partyId: '0',
          ...getSimpleMockTallyResults(election, 10),
        },
      ]}
    />
  );

  const mammalReport = screen.getByTestId('tally-report-0');
  within(mammalReport).getByText('Official Mammal Party Tally Report');
  within(mammalReport).getByText('Mammal Party Example Primary Election');
  expect(
    within(mammalReport).getByTestId('total-ballot-count')
  ).toHaveTextContent('10');

  expect(within(mammalReport).getAllByTestId(/results-table-/)).toHaveLength(2);
  expect(
    within(mammalReport).queryAllByTestId('contest-manual-results')
  ).toHaveLength(0);

  const nonpartisanReport = screen.getByTestId('tally-report-nonpartisan');
  within(mammalReport).getByText('Official Mammal Party Tally Report');
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
