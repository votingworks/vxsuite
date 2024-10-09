import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { TallyReportBuilder } from './tally_report_builder';
import { screen, waitFor, within } from '../../../test/react_testing_library';
import { canonicalizeFilter, canonicalizeGroupBy } from '../../utils/reporting';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.setPrinterStatus({ connected: true });
});

afterEach(() => {
  apiMock.assertComplete();
});

test('happy path', async () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetScannerBatches([]);
  renderInAppContext(<TallyReportBuilder />, {
    electionDefinition,
    apiMock,
  });

  expect(screen.getButton('Generate Report')).toBeDisabled();
  expect(screen.getButton('Print Report')).toBeDisabled();

  // Add Filter
  userEvent.click(screen.getByText('Add Filter'));
  userEvent.click(screen.getByLabelText('Select New Filter Type'));
  userEvent.click(
    within(screen.getByTestId('filter-editor')).getByText('Voting Method')
  );
  screen.getByText('is');
  userEvent.click(screen.getByLabelText('Select Filter Values'));
  userEvent.click(screen.getByText('Absentee'));

  await waitFor(() => {
    expect(screen.getButton('Generate Report')).toBeEnabled();
  });
  expect(screen.getButton('Print Report')).toBeDisabled();

  // Add Group By
  const precinctCheckbox = screen.getByRole('checkbox', { name: 'Precinct' });
  userEvent.click(precinctCheckbox);
  expect(precinctCheckbox).toBeChecked();

  // Load Preview
  apiMock.expectGetTallyReportPreview({
    reportSpec: {
      filter: canonicalizeFilter({
        votingMethods: ['absentee'],
      }),
      groupBy: canonicalizeGroupBy({
        groupByPrecinct: true,
      }),
      includeSignatureLines: false,
    },
    pdfContent: 'Absentee Ballot Tally Report Mock Preview',
  });
  userEvent.click(screen.getButton('Generate Report'));
  await screen.findByText('Absentee Ballot Tally Report Mock Preview');

  // Change Report Parameters
  userEvent.click(screen.getByLabelText('Remove Absentee'));
  userEvent.click(screen.getByLabelText('Select Filter Values'));
  userEvent.click(
    within(screen.getByTestId('filter-editor')).getByText('Precinct')
  );

  // Refresh Preview
  apiMock.expectGetTallyReportPreview({
    reportSpec: {
      filter: canonicalizeFilter({
        votingMethods: ['precinct'],
      }),
      groupBy: canonicalizeGroupBy({
        groupByPrecinct: true,
      }),
      includeSignatureLines: false,
    },
    pdfContent: 'Precinct Ballot Tally Report Mock Preview',
  });
  userEvent.click(screen.getButton('Generate Report'));

  await screen.findByText('Precinct Ballot Tally Report Mock Preview');
});
