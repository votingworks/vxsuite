import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { expectPrint } from '@votingworks/test-utils';
import { buildSimpleMockTallyReportResults } from '@votingworks/utils';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { TallyReportBuilder } from './tally_report_builder';
import { screen, waitFor, within } from '../../../test/react_testing_library';
import { canonicalizeFilter, canonicalizeGroupBy } from '../../utils/reporting';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('happy path', async () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  const { election } = electionDefinition;

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

  // Load Preview
  apiMock.expectGetResultsForTallyReports(
    {
      filter: canonicalizeFilter({
        votingMethods: ['absentee'],
      }),
      groupBy: canonicalizeGroupBy({
        groupByPrecinct: true,
      }),
    },
    [
      {
        precinctId: 'precinct-1',
        ...buildSimpleMockTallyReportResults({
          election,
          scannedBallotCount: 10,
          cardCountsByParty: {
            '0': 3,
            '1': 7,
          },
        }),
      },
      {
        precinctId: 'precinct-2',
        ...buildSimpleMockTallyReportResults({
          election,
          scannedBallotCount: 20,
          cardCountsByParty: {
            '0': 9,
            '1': 11,
          },
        }),
      },
    ]
  );
  userEvent.click(screen.getButton('Generate Report'));

  await screen.findAllByText('Ballot Counts');
  const precinct1MammalPage = screen
    .getAllByText('Unofficial Precinct 1 Absentee Ballot Tally Report')
    .map((element) => element.closest('section')!)
    .find(
      (page) =>
        !!within(page).queryByText('Mammal Party Example Primary Election')
    )!;
  expect(
    within(precinct1MammalPage).getByTestId('total-ballot-count')
  ).toHaveTextContent('3');

  const precinct2Pages = screen
    .getAllByText('Unofficial Precinct 2 Absentee Ballot Tally Report')
    .map((element) => element.closest('section')!);
  expect(precinct2Pages).toHaveLength(3);

  // Change Report Parameters
  userEvent.click(screen.getByLabelText('Remove Absentee'));
  userEvent.click(screen.getByLabelText('Select Filter Values'));
  userEvent.click(
    within(screen.getByTestId('filter-editor')).getByText('Precinct')
  );

  // Refresh Preview
  apiMock.expectGetResultsForTallyReports(
    {
      filter: canonicalizeFilter({
        votingMethods: ['precinct'],
      }),
      groupBy: canonicalizeGroupBy({
        groupByPrecinct: true,
      }),
    },
    [
      {
        precinctId: 'precinct-1',
        ...buildSimpleMockTallyReportResults({
          election,
          scannedBallotCount: 30,
          cardCountsByParty: {
            '0': 17,
            '1': 23,
          },
        }),
      },
      {
        precinctId: 'precinct-2',
        ...buildSimpleMockTallyReportResults({
          election,
          scannedBallotCount: 40,
          cardCountsByParty: {
            '0': 27,
            '1': 13,
          },
        }),
      },
    ]
  );
  userEvent.click(screen.getButton('Generate Report'));

  await screen.findAllByText('Ballot Counts');
  expect(
    screen.getAllByText('Unofficial Precinct 1 Precinct Ballot Tally Report')
  ).toHaveLength(3);
  expect(
    screen.getAllByText('Unofficial Precinct 2 Precinct Ballot Tally Report')
  ).toHaveLength(3);

  // Print Report
  userEvent.click(screen.getButton('Print Report'));
  await expectPrint((printResult) => {
    const printedPrecinct1MammalPage = printResult
      .getAllByText('Unofficial Precinct 1 Precinct Ballot Tally Report')
      .map((element) => element.closest('section')!)
      .find(
        (page) =>
          !!within(page).queryByText('Mammal Party Example Primary Election')
      )!;
    expect(
      within(printedPrecinct1MammalPage).getByTestId('total-ballot-count')
    ).toHaveTextContent('17');
  });
});
