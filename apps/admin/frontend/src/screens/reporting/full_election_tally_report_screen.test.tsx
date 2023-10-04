import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { Logger, fakeLogger } from '@votingworks/logging';
import userEvent from '@testing-library/user-event';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { getSimpleMockTallyResults } from '../../../test/helpers/mock_results';
import { FullElectionTallyReportScreen } from './full_election_tally_report_screen';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { routerPaths } from '../../router_paths';
import { screen, waitFor, within } from '../../../test/react_testing_library';

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
    [getSimpleMockTallyResults({ election, scannedBallotCount: 11 })]
  );

  renderInAppContext(<FullElectionTallyReportScreen />, {
    electionDefinition,
    logger,
    apiMock,
    route: routerPaths.tallyFullReport,
    isOfficialResults: true,
  });

  await screen.findByTestId('tally-report');
  screen.getByText('Official Lincoln Municipal General Election Tally Report');
  expect(screen.getByTestId('total-ballot-count')).toHaveTextContent('11');
});

test('mark results as official', async () => {
  const { election, electionDefinition } = electionFamousNames2021Fixtures;
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetResultsForTallyReports(
    {
      filter: {},
      groupBy: {},
    },
    [getSimpleMockTallyResults({ election, scannedBallotCount: 10 })]
  );

  renderInAppContext(<FullElectionTallyReportScreen />, {
    electionDefinition,
    logger,
    apiMock,
    route: routerPaths.tallyFullReport,
    isOfficialResults: false,
  });

  await screen.findByTestId('tally-report');

  // open and close modal
  userEvent.click(screen.getButton('Mark Tally Results as Official'));
  let modal = await screen.findByRole('alertdialog');
  userEvent.click(within(modal).getButton('Cancel'));
  await waitFor(() => expect(modal).not.toBeInTheDocument());

  // open and mark official
  userEvent.click(screen.getButton('Mark Tally Results as Official'));
  modal = await screen.findByRole('alertdialog');
  apiMock.expectMarkResultsOfficial();
  userEvent.click(within(modal).getButton('Mark Tally Results as Official'));
  await waitFor(() => expect(modal).not.toBeInTheDocument());
});

test('mark official results button disabled when no cvr files', async () => {
  const { election, electionDefinition } = electionFamousNames2021Fixtures;
  apiMock.expectGetCastVoteRecordFileMode('unlocked'); // no CVR files
  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetResultsForTallyReports(
    {
      filter: {},
      groupBy: {},
    },
    [getSimpleMockTallyResults({ election, scannedBallotCount: 10 })]
  );

  renderInAppContext(<FullElectionTallyReportScreen />, {
    electionDefinition,
    logger,
    apiMock,
    route: routerPaths.tallyFullReport,
  });

  await screen.findByTestId('tally-report');
  expect(
    screen.getByRole('button', {
      name: 'Mark Tally Results as Official',
    })
  ).toBeDisabled();
});

test('mark official results button disabled when already official', async () => {
  const { election, electionDefinition } = electionFamousNames2021Fixtures;
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetResultsForTallyReports(
    {
      filter: {},
      groupBy: {},
    },
    [getSimpleMockTallyResults({ election, scannedBallotCount: 10 })]
  );

  renderInAppContext(<FullElectionTallyReportScreen />, {
    electionDefinition,
    logger,
    apiMock,
    route: routerPaths.tallyFullReport,
    isOfficialResults: true,
  });

  await screen.findByTestId('tally-report');
  expect(
    screen.getByRole('button', {
      name: 'Mark Tally Results as Official',
    })
  ).toBeDisabled();
});
