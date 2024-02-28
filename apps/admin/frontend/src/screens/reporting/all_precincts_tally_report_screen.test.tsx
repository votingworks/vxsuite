import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { screen } from '../../../test/react_testing_library';
import {
  AllPrecinctsTallyReportScreen,
  TITLE,
} from './all_precincts_tally_report_screen';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('displays report', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.setPrinterStatus({ connected: true });
  apiMock.expectGetTallyReportPreview({
    reportSpec: {
      filter: {},
      groupBy: { groupByPrecinct: true },
      includeSignatureLines: false,
    },
    pdfContent: 'All Precincts Tally Report Mock Preview',
  });

  renderInAppContext(<AllPrecinctsTallyReportScreen />, {
    electionDefinition,
    apiMock,
    isOfficialResults: false,
  });

  await screen.findByText('All Precincts Tally Report Mock Preview');

  screen.getByRole('heading', { name: TITLE });
  expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
    'href',
    '/reports'
  );
});
