import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { screen } from '../../../test/react_testing_library';
import {
  TITLE,
  SinglePrecinctTallyReportScreen,
} from './single_precinct_tally_report_screen';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('select precinct and view report', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.setPrinterStatus({ connected: true });

  renderInAppContext(<SinglePrecinctTallyReportScreen />, {
    electionDefinition,
    apiMock,
    isOfficialResults: false,
  });

  screen.getByRole('heading', { name: TITLE });
  expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
    'href',
    '/reports'
  );

  // display precinct 1 report
  apiMock.expectGetTallyReportPreview({
    reportSpec: {
      filter: { precinctIds: ['precinct-1'] },
      groupBy: {},
      includeSignatureLines: false,
    },
    pdfContent: 'Precinct 1 Tally Report Mock Preview',
  });
  userEvent.click(screen.getByLabelText('Select Precinct'));
  userEvent.click(screen.getByText('Precinct 1'));

  await screen.findByText('Precinct 1 Tally Report Mock Preview');

  // switch to precinct 2 report
  apiMock.expectGetTallyReportPreview({
    reportSpec: {
      filter: { precinctIds: ['precinct-2'] },
      groupBy: {},
      includeSignatureLines: false,
    },
    pdfContent: 'Precinct 2 Tally Report Mock Preview',
  });
  userEvent.click(screen.getByLabelText('Select Precinct'));
  userEvent.click(screen.getByText('Precinct 2'));
});
