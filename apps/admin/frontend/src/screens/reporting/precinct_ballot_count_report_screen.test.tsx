import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { Logger, fakeLogger } from '@votingworks/logging';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { getMockCardCounts } from '../../../test/helpers/mock_results';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { screen, within } from '../../../test/react_testing_library';
import {
  PrecinctBallotCountReport,
  SCREEN_TITLE,
} from './precinct_ballot_count_report_screen';

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

test('displays report (primary)', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetCardCounts(
    {
      filter: {},
      groupBy: { groupByPrecinct: true, groupByParty: true },
    },
    [
      {
        precinctId: 'precinct-1',
        partyId: '0',
        ...getMockCardCounts(5),
      },
      {
        precinctId: 'precinct-1',
        partyId: '1',
        ...getMockCardCounts(10),
      },
      {
        precinctId: 'precinct-2',
        partyId: '0',
        ...getMockCardCounts(15),
      },
      {
        precinctId: 'precinct-2',
        partyId: '1',
        ...getMockCardCounts(20),
      },
    ]
  );

  renderInAppContext(<PrecinctBallotCountReport />, {
    electionDefinition,
    logger,
    apiMock,
    isOfficialResults: false,
  });

  screen.getByText(SCREEN_TITLE);

  const report = await screen.findByTestId('ballot-count-report');
  within(report).getByText('Unofficial Full Election Ballot Count Report');
  within(report).getByText('Example Primary Election');

  expect(within(report).getAllByText('Precinct 1')).toHaveLength(2);
  expect(within(report).getAllByText('Precinct 2')).toHaveLength(2);
  expect(within(report).getAllByText('Mammal')).toHaveLength(2);
  expect(within(report).getAllByText('Fish')).toHaveLength(2);

  expect(within(report).getByTestId('footer-bmd')).toHaveTextContent('50');
  expect(within(report).getByTestId('footer-total')).toHaveTextContent('50');
});

test('displays report (general)', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetCardCounts(
    {
      filter: {},
      groupBy: { groupByPrecinct: true, groupByParty: false },
    },
    [
      {
        precinctId: '20',
        ...getMockCardCounts(5),
      },
      {
        precinctId: '21',
        ...getMockCardCounts(10),
      },
      {
        precinctId: '22',
        ...getMockCardCounts(15),
      },
      {
        precinctId: '23',
        ...getMockCardCounts(20),
      },
    ]
  );

  renderInAppContext(<PrecinctBallotCountReport />, {
    electionDefinition,
    logger,
    apiMock,
    isOfficialResults: false,
  });

  screen.getByText(SCREEN_TITLE);

  const report = await screen.findByTestId('ballot-count-report');
  within(report).getByText('Unofficial Full Election Ballot Count Report');
  within(report).getByText('Lincoln Municipal General Election');

  for (const precinct of electionDefinition.election.precincts) {
    within(report).getByText(precinct.name);
  }

  expect(within(report).getByTestId('footer-bmd')).toHaveTextContent('50');
  expect(within(report).getByTestId('footer-total')).toHaveTextContent('50');
});
