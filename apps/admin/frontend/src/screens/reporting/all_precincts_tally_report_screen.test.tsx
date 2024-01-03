import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { Logger, fakeLogger } from '@votingworks/logging';
import { buildSimpleMockTallyReportResults } from '@votingworks/utils';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { screen, within } from '../../../test/react_testing_library';
import {
  AllPrecinctsTallyReportScreen,
  TITLE,
} from './all_precincts_tally_report_screen';

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

test('displays report', async () => {
  const { election, electionDefinition } = electionTwoPartyPrimaryFixtures;
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetResultsForTallyReports(
    {
      filter: {},
      groupBy: { groupByPrecinct: true },
    },
    [
      {
        precinctId: 'precinct-1',
        ...buildSimpleMockTallyReportResults({
          election,
          scannedBallotCount: 25,
          cardCountsByParty: {
            '0': 20,
            '1': 5,
          },
        }),
      },
      {
        precinctId: 'precinct-2',
        ...buildSimpleMockTallyReportResults({
          election,
          scannedBallotCount: 40,
          cardCountsByParty: {
            '0': 30,
            '1': 10,
          },
        }),
      },
    ]
  );

  renderInAppContext(<AllPrecinctsTallyReportScreen />, {
    electionDefinition,
    logger,
    apiMock,
    isOfficialResults: false,
  });

  const expectedReports: Array<{
    title: string;
    subtitle: string;
    count: number;
  }> = [
    {
      title: 'Unofficial Precinct 1 Tally Report',
      subtitle: 'Mammal Party Example Primary Election',
      count: 20,
    },
    {
      title: 'Unofficial Precinct 1 Tally Report',
      subtitle: 'Fish Party Example Primary Election',
      count: 5,
    },
    {
      title: 'Unofficial Precinct 1 Tally Report',
      subtitle: 'Example Primary Election Nonpartisan Contests',
      count: 25,
    },
    {
      title: 'Unofficial Precinct 2 Tally Report',
      subtitle: 'Mammal Party Example Primary Election',
      count: 30,
    },
    {
      title: 'Unofficial Precinct 2 Tally Report',
      subtitle: 'Fish Party Example Primary Election',
      count: 10,
    },
    {
      title: 'Unofficial Precinct 2 Tally Report',
      subtitle: 'Example Primary Election Nonpartisan Contests',
      count: 40,
    },
  ];

  screen.getByRole('heading', { name: TITLE });
  expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
    'href',
    '/reports'
  );

  const reports = await screen.findAllByTestId(/tally-report/);
  expect(reports).toHaveLength(expectedReports.length);
  for (const [i, report] of reports.entries()) {
    within(report).getByText(expectedReports[i].title);
    within(report).getByText(expectedReports[i].subtitle);
    expect(within(report).getByTestId('total-ballot-count')).toHaveTextContent(
      expectedReports[i].count.toString()
    );
  }
});
