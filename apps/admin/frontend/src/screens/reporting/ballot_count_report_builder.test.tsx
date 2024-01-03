import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { expectPrint } from '@votingworks/test-utils';
import { Tabulation } from '@votingworks/types';
import { buildMockCardCounts } from '@votingworks/utils';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { screen, waitFor, within } from '../../../test/react_testing_library';
import { canonicalizeFilter, canonicalizeGroupBy } from '../../utils/reporting';
import { BallotCountReportBuilder, TITLE } from './ballot_count_report_builder';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('happy path', async () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  function getMockCardCountList(
    multiplier: number
  ): Tabulation.GroupList<Tabulation.CardCounts> {
    return [
      {
        precinctId: 'precinct-1',
        partyId: '0',
        ...buildMockCardCounts(1 * multiplier),
      },
      {
        precinctId: 'precinct-1',
        partyId: '1',
        ...buildMockCardCounts(2 * multiplier),
      },
      {
        precinctId: 'precinct-2',
        partyId: '0',
        ...buildMockCardCounts(3 * multiplier),
      },
      {
        precinctId: 'precinct-2',
        partyId: '1',
        ...buildMockCardCounts(4 * multiplier),
      },
    ];
  }

  apiMock.expectGetCastVoteRecordFileMode('test');
  apiMock.expectGetScannerBatches([]);
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
  userEvent.click(screen.getByText('Add Filter'));
  userEvent.click(screen.getByLabelText('Select New Filter Type'));
  expect(
    within(screen.getByTestId('filter-editor')).queryByText('Party')
  ).toBeInTheDocument(); // party should be option for primaries, although we don't select it now
  userEvent.click(
    within(screen.getByTestId('filter-editor')).getByText('Voting Method')
  );
  screen.getByText('equals');
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
  const partyCheckbox = screen.getByRole('checkbox', { name: 'Party' });
  userEvent.click(partyCheckbox);
  expect(partyCheckbox).toBeChecked();

  // Load Preview
  apiMock.expectGetCardCounts(
    {
      filter: canonicalizeFilter({
        votingMethods: ['absentee'],
      }),
      groupBy: canonicalizeGroupBy({
        groupByPrecinct: true,
        groupByParty: true,
      }),
    },
    getMockCardCountList(1)
  );
  userEvent.click(screen.getButton('Generate Report'));

  await screen.findByText(
    'Test Unofficial Absentee Ballot Ballot Count Report'
  );
  expect(screen.getByTestId('footer-ballot-count-total')).toHaveTextContent(
    '10'
  );

  // Change Report Parameters
  userEvent.click(screen.getByLabelText('Remove Absentee'));
  userEvent.click(screen.getByLabelText('Select Filter Values'));
  userEvent.click(
    within(screen.getByTestId('filter-editor')).getByText('Precinct')
  );

  // Refresh Preview
  apiMock.expectGetCardCounts(
    {
      filter: canonicalizeFilter({
        votingMethods: ['precinct'],
      }),
      groupBy: canonicalizeGroupBy({
        groupByPrecinct: true,
        groupByParty: true,
      }),
    },
    getMockCardCountList(2)
  );
  userEvent.click(screen.getByText('Generate Report'));

  await screen.findByText(
    'Test Unofficial Precinct Ballot Ballot Count Report'
  );
  expect(screen.getByTestId('footer-ballot-count-total')).toHaveTextContent(
    '20'
  );
  expect(screen.getByTestId('footer-ballot-count-bmd')).toHaveTextContent('20');
  expect(
    screen.queryByTestId('footer-ballot-count-manual')
  ).not.toBeInTheDocument();

  // Print Report
  userEvent.click(screen.getButton('Print Report'));
  await expectPrint((printResult) => {
    printResult.getByText(
      'Test Unofficial Precinct Ballot Ballot Count Report'
    );
    expect(
      printResult.getByTestId('footer-ballot-count-total')
    ).toHaveTextContent('20');
  });
});

test('does not show party options for non-primary elections', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

  apiMock.expectGetCastVoteRecordFileMode('test');
  apiMock.expectGetScannerBatches([]);
  renderInAppContext(<BallotCountReportBuilder />, {
    electionDefinition,
    apiMock,
  });

  expect(screen.queryByText('Load Preview')).not.toBeInTheDocument();

  // no group by
  expect(screen.queryByLabelText('Party')).not.toBeInTheDocument();

  // no filter
  userEvent.click(screen.getByText('Add Filter'));
  userEvent.click(screen.getByLabelText('Select New Filter Type'));
  expect(
    within(screen.getByTestId('filter-editor')).queryByText('Party')
  ).not.toBeInTheDocument();
});

test('shows sheet option for multi-sheet elections', () => {
  const { multiSheetElectionDefinition: electionDefinition } =
    electionFamousNames2021Fixtures;

  apiMock.expectGetCastVoteRecordFileMode('test');
  apiMock.expectGetScannerBatches([]);
  renderInAppContext(<BallotCountReportBuilder />, {
    electionDefinition,
    apiMock,
  });

  screen.getByRole('checkbox', { name: 'Sheet', checked: false });
});
