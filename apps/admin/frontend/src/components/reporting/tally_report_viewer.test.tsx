import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import {
  deferNextPrint,
  expectPrint,
  hasTextAcrossElements,
  simulateErrorOnNextPrint,
} from '@votingworks/test-utils';
import {
  waitFor,
  waitForElementToBeRemoved,
  within,
} from '@testing-library/react';
import { LogEventId, fakeLogger } from '@votingworks/logging';
import { Tabulation } from '@votingworks/types';
import { ApiMock, createApiMock } from '../../../test/helpers/api_mock';
import { screen } from '../../../test/react_testing_library';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { TallyReportViewer } from './tally_report_viewer';
import { getSimpleMockTallyResults } from '../../../test/helpers/mock_results';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('disabled shows disabled buttons and no preview', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  renderInAppContext(
    <TallyReportViewer disabled filter={{}} groupBy={{}} autoPreview={false} />,
    { apiMock, electionDefinition }
  );

  expect(screen.getButton('Print Report')).toBeDisabled();
});

test('autoPreview loads preview automatically', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { election } = electionDefinition;
  apiMock.expectGetResultsForTallyReports(
    {
      filter: {},
      groupBy: {},
    },
    [
      getSimpleMockTallyResults({
        election,
        scannedBallotCount: 10,
      }),
    ]
  );

  renderInAppContext(
    <TallyReportViewer disabled={false} filter={{}} groupBy={{}} autoPreview />,
    { apiMock, electionDefinition }
  );

  expect(screen.getButton('Print Report')).not.toBeDisabled();
  await screen.findByText(
    'Unofficial Lincoln Municipal General Election Tally Report'
  );
  expect(screen.getByTestId('total-ballot-count')).toHaveTextContent('10');
});

test('autoPreview = false does not load preview automatically', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      filter={{}}
      groupBy={{}}
      autoPreview={false}
    />,
    { apiMock, electionDefinition }
  );

  expect(screen.getButton('Print Report')).not.toBeDisabled();
  screen.getButton('Load Preview');
});

test('print before loading preview', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { election } = electionDefinition;
  const { resolve: resolveData } = apiMock.expectGetResultsForTallyReports(
    {
      filter: {},
      groupBy: {},
    },
    [
      getSimpleMockTallyResults({
        election,
        scannedBallotCount: 10,
      }),
    ],
    true
  );

  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      filter={{}}
      groupBy={{}}
      autoPreview={false}
    />,
    { apiMock, electionDefinition }
  );

  screen.getButton('Load Preview');
  const { resolve: resolvePrint } = deferNextPrint();
  userEvent.click(screen.getButton('Print Report'));
  const modal = await screen.findByRole('alertdialog');
  await within(modal).findByText('Generating Report');
  resolveData();
  await within(modal).findByText('Printing Report');
  resolvePrint();
  await waitForElementToBeRemoved(screen.queryByRole('alertdialog'));
  await expectPrint((printResult) => {
    printResult.getByText(
      'Unofficial Lincoln Municipal General Election Tally Report'
    );
    expect(printResult.getByTestId('total-ballot-count')).toHaveTextContent(
      '10'
    );
  });

  // the preview will now show the report, because its available
  screen.getByText(
    'Unofficial Lincoln Municipal General Election Tally Report'
  );
  expect(screen.getByTestId('total-ballot-count')).toHaveTextContent('10');
});

test('print after preview loaded + test success logging', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { election } = electionDefinition;
  apiMock.expectGetResultsForTallyReports(
    {
      filter: {},
      groupBy: {},
    },
    [
      getSimpleMockTallyResults({
        election,
        scannedBallotCount: 10,
      }),
    ]
  );

  const logger = fakeLogger();
  renderInAppContext(
    <TallyReportViewer disabled={false} filter={{}} groupBy={{}} autoPreview />,
    { apiMock, electionDefinition, logger }
  );

  await screen.findByText(
    'Unofficial Lincoln Municipal General Election Tally Report'
  );

  const { resolve: resolvePrint } = deferNextPrint();
  userEvent.click(screen.getButton('Print Report'));
  const modal = await screen.findByRole('alertdialog');
  await within(modal).findByText('Printing Report');
  resolvePrint();
  await waitForElementToBeRemoved(screen.queryByRole('alertdialog'));
  await expectPrint((printResult) => {
    printResult.getByText(
      'Unofficial Lincoln Municipal General Election Tally Report'
    );
    expect(printResult.getByTestId('total-ballot-count')).toHaveTextContent(
      '10'
    );
  });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.TallyReportPrinted,
    'election_manager',
    {
      disposition: 'success',
      message: 'User printed a custom tally report from the report builder.',
    }
  );
});

test('print while preview is loading', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { election } = electionDefinition;
  const { resolve: resolveData } = apiMock.expectGetResultsForTallyReports(
    {
      filter: {},
      groupBy: {},
    },
    [
      getSimpleMockTallyResults({
        election,
        scannedBallotCount: 10,
      }),
    ],
    true
  );

  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      filter={{}}
      groupBy={{}}
      autoPreview={false}
    />,
    { apiMock, electionDefinition }
  );

  userEvent.click(screen.getButton('Load Preview'));
  await screen.findByText('Generating Report');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  const { resolve: resolvePrint } = deferNextPrint();
  userEvent.click(screen.getButton('Print Report'));
  const modal = await screen.findByRole('alertdialog');
  await within(modal).findByText('Generating Report');
  expect(screen.getAllByText('Generating Report')).toHaveLength(2);
  resolveData();
  await within(modal).findByText('Printing Report');
  resolvePrint();
  await expectPrint((printResult) => {
    printResult.getByText(
      'Unofficial Lincoln Municipal General Election Tally Report'
    );
    expect(printResult.getByTestId('total-ballot-count')).toHaveTextContent(
      '10'
    );
  });

  screen.getByText(
    'Unofficial Lincoln Municipal General Election Tally Report'
  );
  expect(screen.getByTestId('total-ballot-count')).toHaveTextContent('10');
});

test('print failure logging', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { election } = electionDefinition;
  apiMock.expectGetResultsForTallyReports(
    {
      filter: {},
      groupBy: {},
    },
    [
      getSimpleMockTallyResults({
        election,
        scannedBallotCount: 10,
      }),
    ]
  );

  const logger = fakeLogger();
  renderInAppContext(
    <TallyReportViewer disabled={false} filter={{}} groupBy={{}} autoPreview />,
    { apiMock, electionDefinition, logger }
  );

  await screen.findByText(
    'Unofficial Lincoln Municipal General Election Tally Report'
  );

  simulateErrorOnNextPrint(new Error('printer broken'));
  userEvent.click(screen.getButton('Print Report'));
  await waitFor(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.TallyReportPrinted,
      'election_manager',
      {
        disposition: 'failure',
        message:
          'User attempted to print a custom tally report from the report builder, but an error occurred: printer broken',
      }
    );
  });
});

test('displays custom filter rather than specific title when necessary', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { election } = electionDefinition;
  const filter: Tabulation.Filter = {
    ballotStyleIds: ['1'],
    precinctIds: ['23'],
    votingMethods: ['absentee'],
  };

  apiMock.expectGetResultsForTallyReports(
    {
      filter,
      groupBy: {},
    },
    [
      getSimpleMockTallyResults({
        election,
        scannedBallotCount: 10,
      }),
    ]
  );

  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      filter={filter}
      groupBy={{}}
      autoPreview
    />,
    { apiMock, electionDefinition }
  );

  await screen.findByText('Unofficial Custom Filter Tally Report');
  screen.getByText(hasTextAcrossElements('Voting Method: Absentee'));
  screen.getByText(hasTextAcrossElements('Ballot Style: 1'));
  screen.getByText(hasTextAcrossElements('Precinct: North Lincoln'));
});
