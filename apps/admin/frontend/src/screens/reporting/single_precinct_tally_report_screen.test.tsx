import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { Logger, fakeLogger } from '@votingworks/logging';
import userEvent from '@testing-library/user-event';
import { buildSimpleMockTallyReportResults } from '@votingworks/utils';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { screen, within } from '../../../test/react_testing_library';
import {
  TITLE,
  SinglePrecinctTallyReportScreen,
} from './single_precinct_tally_report_screen';

let logger: Logger;
let apiMock: ApiMock;

beforeEach(() => {
  logger = fakeLogger();
  apiMock = createApiMock();
});

afterEach(() => {
  delete window.kiosk;
  apiMock.assertComplete();
});

test('select precinct and view report', async () => {
  const { election, electionDefinition } = electionTwoPartyPrimaryFixtures;
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetScannerBatches([]);

  renderInAppContext(<SinglePrecinctTallyReportScreen />, {
    electionDefinition,
    logger,
    apiMock,
    isOfficialResults: false,
  });

  screen.getByRole('heading', { name: TITLE });
  expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
    'href',
    '/reports'
  );

  // display precinct 1 report
  apiMock.expectGetResultsForTallyReports(
    {
      filter: { precinctIds: ['precinct-1'] },
      groupBy: {},
    },
    [
      buildSimpleMockTallyReportResults({
        election,
        scannedBallotCount: 25,
        cardCountsByParty: {
          '0': 20,
          '1': 5,
        },
      }),
    ]
  );
  userEvent.click(screen.getByLabelText('Select Precinct'));
  userEvent.click(screen.getByText('Precinct 1'));

  const expectedPrecinct1Reports: Array<{
    subtitle: string;
    count: number;
  }> = [
    {
      subtitle: 'Mammal Party Example Primary Election',
      count: 20,
    },
    {
      subtitle: 'Fish Party Example Primary Election',
      count: 5,
    },
    {
      subtitle: 'Example Primary Election Nonpartisan Contests',
      count: 25,
    },
  ];

  const precinct1Reports = await screen.findAllByTestId(/tally-report/);
  expect(precinct1Reports).toHaveLength(expectedPrecinct1Reports.length);
  for (const [i, report] of precinct1Reports.entries()) {
    within(report).getByText('Unofficial Precinct 1 Tally Report');
    within(report).getByText(expectedPrecinct1Reports[i].subtitle);
    expect(within(report).getByTestId('total-ballot-count')).toHaveTextContent(
      expectedPrecinct1Reports[i].count.toString()
    );
  }

  // display precinct 2 report
  apiMock.expectGetResultsForTallyReports(
    {
      filter: { precinctIds: ['precinct-2'] },
      groupBy: {},
    },
    [
      buildSimpleMockTallyReportResults({
        election,
        scannedBallotCount: 40,
        cardCountsByParty: {
          '0': 30,
          '1': 10,
        },
      }),
    ]
  );
  userEvent.click(screen.getByLabelText('Select Precinct'));
  userEvent.click(screen.getByText('Precinct 2'));

  const expectedPrecinct2Reports: Array<{
    subtitle: string;
    count: number;
  }> = [
    {
      subtitle: 'Mammal Party Example Primary Election',
      count: 30,
    },
    {
      subtitle: 'Fish Party Example Primary Election',
      count: 10,
    },
    {
      subtitle: 'Example Primary Election Nonpartisan Contests',
      count: 40,
    },
  ];

  const precinct2Reports = await screen.findAllByTestId(/tally-report/);
  expect(precinct2Reports).toHaveLength(expectedPrecinct2Reports.length);
  for (const [i, report] of precinct2Reports.entries()) {
    within(report).getByText('Unofficial Precinct 2 Tally Report');
    within(report).getByText(expectedPrecinct2Reports[i].subtitle);
    expect(within(report).getByTestId('total-ballot-count')).toHaveTextContent(
      expectedPrecinct2Reports[i].count.toString()
    );
  }
});
