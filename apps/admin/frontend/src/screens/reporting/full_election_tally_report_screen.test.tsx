import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { Logger, fakeLogger } from '@votingworks/logging';
import { buildSimpleMockTallyReportResults } from '@votingworks/utils';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import {
  FullElectionTallyReportScreen,
  TITLE,
} from './full_election_tally_report_screen';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { routerPaths } from '../../router_paths';
import { screen } from '../../../test/react_testing_library';

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
  const { election, electionDefinition } = electionFamousNames2021Fixtures;
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetResultsForTallyReports(
    {
      filter: {},
      groupBy: {},
    },
    [buildSimpleMockTallyReportResults({ election, scannedBallotCount: 11 })]
  );

  renderInAppContext(<FullElectionTallyReportScreen />, {
    electionDefinition,
    logger,
    apiMock,
    route: routerPaths.tallyFullReport,
    isOfficialResults: true,
  });

  screen.getByRole('heading', { name: TITLE });
  expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
    'href',
    '/reports'
  );

  await screen.findByTestId('tally-report');
  screen.getByText('Official Lincoln Municipal General Election Tally Report');
  expect(screen.getByTestId('total-ballot-count')).toHaveTextContent('11');

  // for the full election tally report only, we display the "Certification Signatures" section
  screen.getByText('Certification Signatures:');
});
