import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  electionFamousNames2021Fixtures,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { userEvent } from '@testing-library/user-event';
import {
  type ApiMock,
  createApiMock,
} from '../../../test/helpers/mock_api_client.js';
import { renderInAppContext } from '../../../test/render_in_app_context.js';
import { screen, within } from '../../../test/react_testing_library.js';
import {
  canonicalizeFilter,
  canonicalizeGroupBy,
} from '../../utils/reporting.js';
import {
  BallotCountReportBuilder,
  TITLE,
} from './ballot_count_report_builder.js';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.setPrinterStatus({ connected: true });
});

afterEach(() => {
  apiMock.assertComplete();
});

test('offers reporting status filter and grouping when withholding is enabled', async () => {
  const electionDefinition = readElectionTwoPartyPrimaryDefinition();

  apiMock.expectGetCastVoteRecordFileMode('test');
  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    countCentralScanBallotsOnlyAfterAdjudication: true,
  });
  renderInAppContext(<BallotCountReportBuilder />, {
    electionDefinition,
    apiMock,
  });

  expect(screen.getButton('Generate Report')).toBeDisabled();
  await userEvent.click(
    await screen.findByRole('checkbox', { name: 'Reporting Status' })
  );
  expect(screen.getButton('Generate Report')).toBeEnabled();

  await userEvent.click(screen.getByText('Add Filter'));
  await userEvent.click(screen.getByLabelText('Select New Filter Type'));
  await userEvent.click(
    within(screen.getByTestId('filter-editor')).getByText('Reporting Status')
  );
  await userEvent.click(screen.getByLabelText('Select Filter Values'));
  await userEvent.click(screen.getByText('Counted'));

  // the selected status must reach the backend, not just the filter editor
  apiMock.expectGetBallotCountReportPreview({
    reportSpec: {
      filter: { ...canonicalizeFilter({}), reportingStatus: 'counted' },
      groupBy: canonicalizeGroupBy({ groupByReportingStatus: true }),
      includeSheetCounts: false,
    },
    pdfContent: 'Counted Ballots Ballot Count Report',
  });
  await vi.waitFor(() => {
    expect(screen.getButton('Generate Report')).toBeEnabled();
  });
  await userEvent.click(screen.getButton('Generate Report'));
  await screen.findByText('Counted Ballots Ballot Count Report');
});

test('happy path', async () => {
  const electionDefinition = readElectionTwoPartyPrimaryDefinition();

  apiMock.expectGetCastVoteRecordFileMode('test');
  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetSystemSettings();
  renderInAppContext(<BallotCountReportBuilder />, {
    electionDefinition,
    apiMock,
  });

  screen.getByRole('heading', { name: TITLE });
  expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
    'href',
    '/reports'
  );

  expect(screen.queryByText('Load Preview')).not.toBeInTheDocument();
  expect(screen.getButton('Print Report')).toBeDisabled();

  // Add Filter
  await userEvent.click(screen.getByText('Add Filter'));
  await userEvent.click(screen.getByLabelText('Select New Filter Type'));
  expect(
    within(screen.getByTestId('filter-editor')).queryByText('Party')
  ).toBeInTheDocument(); // party should be option for primaries, although we don't select it now
  // reporting status is only offered when withholding is enabled
  expect(
    within(screen.getByTestId('filter-editor')).queryByText('Reporting Status')
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('checkbox', { name: 'Reporting Status' })
  ).not.toBeInTheDocument();
  await userEvent.click(
    within(screen.getByTestId('filter-editor')).getByText('Voting Method')
  );
  screen.getByText('is');
  await userEvent.click(screen.getByLabelText('Select Filter Values'));
  await userEvent.click(screen.getByText('Absentee'));

  await vi.waitFor(() => {
    expect(screen.getButton('Generate Report')).toBeEnabled();
  });
  expect(screen.getButton('Print Report')).toBeDisabled();

  // Add Group By
  const precinctCheckbox = screen.getByRole('checkbox', { name: 'Precinct' });
  await userEvent.click(precinctCheckbox);
  expect(precinctCheckbox).toBeChecked();
  const partyCheckbox = screen.getByRole('checkbox', { name: 'Party' });
  await userEvent.click(partyCheckbox);
  expect(partyCheckbox).toBeChecked();

  // Load Preview
  apiMock.expectGetBallotCountReportPreview({
    reportSpec: {
      filter: canonicalizeFilter({
        votingMethods: ['absentee'],
      }),
      groupBy: canonicalizeGroupBy({
        groupByPrecinct: true,
        groupByParty: true,
      }),
      includeSheetCounts: false,
    },
    pdfContent: 'Test Unofficial Absentee Ballot Ballot Count Report',
  });
  await userEvent.click(screen.getButton('Generate Report'));

  await screen.findByText(
    'Test Unofficial Absentee Ballot Ballot Count Report'
  );

  // Change Report Parameters
  await userEvent.click(screen.getByLabelText('Remove Absentee'));
  await userEvent.click(screen.getByLabelText('Select Filter Values'));
  await userEvent.click(
    within(screen.getByTestId('filter-editor')).getByText('Precinct')
  );

  // Refresh Preview
  apiMock.expectGetBallotCountReportPreview({
    reportSpec: {
      filter: canonicalizeFilter({
        votingMethods: ['precinct'],
      }),
      groupBy: canonicalizeGroupBy({
        groupByPrecinct: true,
        groupByParty: true,
      }),
      includeSheetCounts: false,
    },
    pdfContent: 'Test Unofficial Precinct Ballot Ballot Count Report',
  });
  await userEvent.click(screen.getByText('Generate Report'));

  await screen.findByText(
    'Test Unofficial Precinct Ballot Ballot Count Report'
  );
});

test('does not show party options for non-primary elections', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();

  apiMock.expectGetCastVoteRecordFileMode('test');
  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetSystemSettings();
  renderInAppContext(<BallotCountReportBuilder />, {
    electionDefinition,
    apiMock,
  });

  expect(screen.queryByText('Load Preview')).not.toBeInTheDocument();

  // no group by
  expect(screen.queryByLabelText('Party')).not.toBeInTheDocument();

  // no filter
  await userEvent.click(screen.getByText('Add Filter'));
  await userEvent.click(screen.getByLabelText('Select New Filter Type'));
  expect(
    within(screen.getByTestId('filter-editor')).queryByText('Party')
  ).not.toBeInTheDocument();
});

test('shows sheet option for multi-sheet elections', () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.makeMultiSheetElectionDefinition();

  apiMock.expectGetCastVoteRecordFileMode('test');
  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetSystemSettings();
  renderInAppContext(<BallotCountReportBuilder />, {
    electionDefinition,
    apiMock,
  });

  screen.getByRole('checkbox', { name: 'Sheet', checked: false });
});
