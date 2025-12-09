import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { err, ok } from '@votingworks/basics';
import fileDownload from 'js-file-download';
import type {
  ConvertMsResultsError,
  GetExportedElectionError,
} from '@votingworks/design-backend';
import {
  createMockApiClient,
  MockApiClient,
  mockUserFeatures,
  jurisdiction,
  provideApi,
  user,
} from '../test/api_helpers';
import { render, screen } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { ConvertResultsScreen } from './convert_results_screen';
import { routes } from './routes';
import { generalElectionRecord } from '../test/fixtures';

vi.mock('js-file-download');

const electionRecord = generalElectionRecord(jurisdiction.id);
const electionId = electionRecord.election.id;

const allPrecinctsTallyReportContents = 'mock tally report csv contents';
const allPrecinctsTallyReportFile = new File(
  [allPrecinctsTallyReportContents],
  'tally-report.csv',
  { type: 'text/csv' }
);
// JSDOM's File doesn't implement File.text
allPrecinctsTallyReportFile.text = () =>
  Promise.resolve(allPrecinctsTallyReportContents);

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
  apiMock.getUser.expectCallWith().resolves(user);
  mockUserFeatures(apiMock);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen() {
  render(
    provideApi(
      apiMock,
      withRoute(<ConvertResultsScreen />, {
        paramPath: routes.election(':electionId').convertResults.path,
        path: routes.election(electionId).convertResults.path,
      })
    )
  );
}

test('convert results flow', async () => {
  renderScreen();
  await screen.findByRole('heading', { name: 'Convert Results' });

  const mockConvertedResults = 'mock converted results contents';
  const mockBallotHash = 'mock-ballot-hash';

  apiMock.convertMsResults
    .expectCallWith({
      electionId,
      allPrecinctsTallyReportContents,
    })
    .resolves(
      ok({
        convertedResults: mockConvertedResults,
        ballotHash: mockBallotHash,
      })
    );
  userEvent.upload(
    screen.getByLabelText('Upload Tally Report CSV'),
    allPrecinctsTallyReportFile
  );

  await screen.findByText('Results Converted');
  userEvent.click(
    screen.getByRole('button', { name: 'Download SEMS Results File' })
  );

  expect(fileDownload).toHaveBeenCalledWith(
    mockConvertedResults,
    `sems-results-${mockBallotHash}.txt`
  );
});

type ErrorCode = GetExportedElectionError | ConvertMsResultsError;
const errorMessages: Record<ErrorCode, string> = {
  'wrong-election': 'This report is for a different election.',
  'wrong-tally-report': 'This report is not the All Precincts Tally Report.',
  'election-out-of-date': 'Election is out of date.',
  'no-election-export-found':
    'Election must be exported before converting results.',
  'invalid-headers':
    'Invalid CSV headers. Make sure you are uploading the All Precincts Tally Report exported from VxAdmin.',
  'report-contests-mismatch':
    'This report contains different contests than this election.',
  'report-precincts-mismatch':
    'This report contains different precincts than this election.',
};

test.each(Object.entries(errorMessages))(
  'shows error message on conversion failure: %s',
  async (errorCode, expectedMessage) => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Convert Results' });

    apiMock.convertMsResults
      .expectCallWith({
        electionId,
        allPrecinctsTallyReportContents,
      })
      .resolves(err(errorCode as ErrorCode));
    userEvent.upload(
      screen.getByLabelText('Upload Tally Report CSV'),
      allPrecinctsTallyReportFile
    );

    await screen.findByText('Error Converting Results');
    screen.getByText(expectedMessage);
  }
);

test('shows error message on unexpected conversion error', async () => {
  renderScreen();
  await screen.findByRole('heading', { name: 'Convert Results' });
  apiMock.convertMsResults
    .expectCallWith({
      electionId,
      allPrecinctsTallyReportContents,
    })
    .resolves(err(new Error('unexpected error')));
  userEvent.upload(
    screen.getByLabelText('Upload Tally Report CSV'),
    allPrecinctsTallyReportFile
  );

  await screen.findByText('Error Converting Results');
  screen.getByText('unexpected error');
});
