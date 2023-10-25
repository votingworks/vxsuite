import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { expectPrint } from '@votingworks/test-utils';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { TallyReportBuilder } from './tally_report_builder';
import { screen, within } from '../../../test/react_testing_library';
import { getSimpleMockTallyResults } from '../../../test/helpers/mock_results';
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

  expect(screen.queryByText('Load Preview')).not.toBeInTheDocument();
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

  await screen.findButton('Load Preview');
  expect(screen.getButton('Print Report')).not.toBeDisabled();

  // Add Group By
  userEvent.click(screen.getButton('Report By Precinct'));

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
        ...getSimpleMockTallyResults({ election, scannedBallotCount: 10 }),
      },
      {
        precinctId: 'precinct-2',
        ...getSimpleMockTallyResults({ election, scannedBallotCount: 20 }),
      },
    ]
  );
  userEvent.click(screen.getButton('Load Preview'));

  await screen.findByText('Unofficial Precinct 1 Absentee Ballot Tally Report');
  const precinct1Page = screen
    .getByText('Unofficial Precinct 1 Absentee Ballot Tally Report')
    .closest('section')!;
  expect(
    within(precinct1Page).getByTestId('total-ballot-count')
  ).toHaveTextContent('10');

  screen.getByText('Unofficial Precinct 2 Absentee Ballot Tally Report');

  // Change Report Parameters
  userEvent.click(screen.getByLabelText('Remove Absentee'));
  userEvent.click(screen.getByLabelText('Select Filter Values'));
  userEvent.click(
    within(screen.getByTestId('filter-editor')).getByText('Precinct')
  );
  screen.getByText('Refresh Preview');

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
        ...getSimpleMockTallyResults({ election, scannedBallotCount: 10 }),
      },
      {
        precinctId: 'precinct-2',
        ...getSimpleMockTallyResults({ election, scannedBallotCount: 20 }),
      },
    ]
  );
  userEvent.click(screen.getByText('Refresh Preview'));

  await screen.findByText('Unofficial Precinct 1 Precinct Ballot Tally Report');
  screen.getByText('Unofficial Precinct 2 Precinct Ballot Tally Report');

  // Print Report
  userEvent.click(screen.getButton('Print Report'));
  await expectPrint((printResult) => {
    printResult.getByText('Unofficial Precinct 1 Precinct Ballot Tally Report');
    const printedPrecinct1Page = printResult
      .getByText('Unofficial Precinct 1 Precinct Ballot Tally Report')
      .closest('section')!;
    expect(
      within(printedPrecinct1Page).getByTestId('total-ballot-count')
    ).toHaveTextContent('10');

    printResult.getByText('Unofficial Precinct 2 Precinct Ballot Tally Report');
  });
});
