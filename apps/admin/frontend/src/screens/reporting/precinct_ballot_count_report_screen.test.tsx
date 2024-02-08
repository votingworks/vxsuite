import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { Logger, fakeLogger } from '@votingworks/logging';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { screen } from '../../../test/react_testing_library';
import {
  PrecinctBallotCountReport,
  TITLE,
} from './precinct_ballot_count_report_screen';

let logger: Logger;
let apiMock: ApiMock;

beforeEach(() => {
  logger = fakeLogger();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('displays report (primary)', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.setPrinterStatus({ connected: true });
  apiMock.expectGetBallotCountReportPreview({
    reportSpec: {
      filter: {},
      groupBy: { groupByPrecinct: true, groupByParty: true },
      includeSheetCounts: false,
    },
    pdfContent: 'Precinct Ballot Count Report Mock Preview',
  });

  renderInAppContext(<PrecinctBallotCountReport />, {
    electionDefinition,
    logger,
    apiMock,
    isOfficialResults: false,
  });

  await screen.findByText('Precinct Ballot Count Report Mock Preview');

  screen.getByRole('heading', { name: TITLE });
  expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
    'href',
    '/reports'
  );
});

test('displays report (general)', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.setPrinterStatus({ connected: true });
  apiMock.expectGetBallotCountReportPreview({
    reportSpec: {
      filter: {},
      groupBy: { groupByParty: false, groupByPrecinct: true },
      includeSheetCounts: false,
    },
    pdfContent: 'Precinct Ballot Count Report Mock Preview',
  });

  renderInAppContext(<PrecinctBallotCountReport />, {
    electionDefinition,
    logger,
    apiMock,
    isOfficialResults: false,
  });

  await screen.findByText('Precinct Ballot Count Report Mock Preview');

  screen.getByRole('heading', { name: TITLE });
  expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
    'href',
    '/reports'
  );
});
