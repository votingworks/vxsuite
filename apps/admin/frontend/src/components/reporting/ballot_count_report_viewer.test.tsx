import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import {
  deferNextPrint,
  expectPrint,
  expectPrintToPdf,
  fakeKiosk,
  hasTextAcrossElements,
  simulateErrorOnNextPrint,
} from '@votingworks/test-utils';
import { waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import { LogEventId, fakeLogger } from '@votingworks/logging';
import { Tabulation } from '@votingworks/types';
import { act } from 'react-dom/test-utils';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { screen, within } from '../../../test/react_testing_library';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { getMockCardCounts } from '../../../test/helpers/mock_results';
import { BallotCountReportViewer } from './ballot_count_report_viewer';

let apiMock: ApiMock;

const MOCK_VOTING_METHOD_CARD_COUNTS: Tabulation.GroupList<Tabulation.CardCounts> =
  [
    {
      votingMethod: 'absentee',
      ...getMockCardCounts(1, undefined, 3),
    },
    {
      votingMethod: 'precinct',
      ...getMockCardCounts(0, undefined, 1),
    },
  ];

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetScannerBatches([]);
});

afterEach(() => {
  apiMock.assertComplete();
  window.kiosk = undefined;
});

test('disabled shows disabled buttons and no preview', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  renderInAppContext(
    <BallotCountReportViewer
      disabled
      filter={{}}
      groupBy={{}}
      autoPreview={false}
    />,
    { apiMock, electionDefinition }
  );

  expect(screen.getButton('Print Report')).toBeDisabled();
  expect(screen.getButton('Export Report PDF')).toBeDisabled();
  expect(screen.getButton('Export Report CSV')).toBeDisabled();
});

test('autoPreview loads preview automatically', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  apiMock.expectGetCardCounts(
    {
      filter: {},
      groupBy: { groupByVotingMethod: true },
    },
    MOCK_VOTING_METHOD_CARD_COUNTS
  );

  renderInAppContext(
    <BallotCountReportViewer
      disabled={false}
      filter={{}}
      groupBy={{ groupByVotingMethod: true }}
      autoPreview
    />,
    { apiMock, electionDefinition }
  );

  await screen.findByText('Unofficial Full Election Ballot Count Report');
  expect(screen.getByTestId('footer-total')).toHaveTextContent('5');
});

test('autoPreview = false does not load preview automatically', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

  renderInAppContext(
    <BallotCountReportViewer
      disabled={false}
      filter={{}}
      groupBy={{}}
      autoPreview={false}
    />,
    { apiMock, electionDefinition }
  );

  await screen.findButton('Load Preview');
});

test('shows no results warning when no results', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  apiMock.expectGetCardCounts(
    {
      filter: {},
      groupBy: { groupByBatch: true },
    },
    []
  );

  renderInAppContext(
    <BallotCountReportViewer
      disabled={false}
      filter={{}}
      groupBy={{ groupByBatch: true }}
      autoPreview
    />,
    { apiMock, electionDefinition }
  );

  await screen.findByText(
    'No results found given the current report parameters.'
  );

  for (const buttonLabel of [
    'Print Report',
    'Export Report PDF',
    'Export Report CSV',
  ]) {
    expect(screen.getButton(buttonLabel)).toBeDisabled();
  }
});

test('print before loading preview', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { resolve: resolveData } = apiMock.expectGetCardCounts(
    {
      filter: {},
      groupBy: { groupByVotingMethod: true },
    },
    MOCK_VOTING_METHOD_CARD_COUNTS,
    true
  );

  renderInAppContext(
    <BallotCountReportViewer
      disabled={false}
      filter={{}}
      groupBy={{ groupByVotingMethod: true }}
      autoPreview={false}
    />,
    { apiMock, electionDefinition }
  );

  await screen.findButton('Load Preview');
  const { resolve: resolvePrint } = deferNextPrint();
  userEvent.click(screen.getButton('Print Report'));
  const modal = await screen.findByRole('alertdialog');
  await within(modal).findByText('Generating Report');
  resolveData();
  await within(modal).findByText('Printing Report');
  resolvePrint();
  await waitForElementToBeRemoved(screen.queryByRole('alertdialog'));
  await expectPrint((printResult) => {
    printResult.getByText('Unofficial Full Election Ballot Count Report');
    expect(printResult.getByTestId('footer-total')).toHaveTextContent('5');
  });

  // the preview will now show the report, because its available
  screen.getByText('Unofficial Full Election Ballot Count Report');
  expect(screen.getByTestId('footer-total')).toHaveTextContent('5');
});

test('print after preview loaded + test success logging', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  apiMock.expectGetCardCounts(
    {
      filter: {},
      groupBy: { groupByVotingMethod: true },
    },
    MOCK_VOTING_METHOD_CARD_COUNTS
  );

  const logger = fakeLogger();
  renderInAppContext(
    <BallotCountReportViewer
      disabled={false}
      filter={{}}
      groupBy={{ groupByVotingMethod: true }}
      autoPreview
    />,
    { apiMock, electionDefinition, logger }
  );

  await screen.findByText('Unofficial Full Election Ballot Count Report');

  const { resolve: resolvePrint } = deferNextPrint();
  userEvent.click(screen.getButton('Print Report'));
  const modal = await screen.findByRole('alertdialog');
  await within(modal).findByText('Printing Report');
  resolvePrint();
  await waitForElementToBeRemoved(screen.queryByRole('alertdialog'));
  await expectPrint((printResult) => {
    printResult.getByText('Unofficial Full Election Ballot Count Report');
    expect(printResult.getByTestId('footer-total')).toHaveTextContent('5');
  });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.TallyReportPrinted,
    'election_manager',
    {
      disposition: 'success',
      message: 'User printed a ballot count report.',
      filter: '{}',
      groupBy: '{"groupByVotingMethod":true}',
    }
  );
});

test('print while preview is loading', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { resolve: resolveData } = apiMock.expectGetCardCounts(
    {
      filter: {},
      groupBy: { groupByVotingMethod: true },
    },
    MOCK_VOTING_METHOD_CARD_COUNTS,
    true
  );

  renderInAppContext(
    <BallotCountReportViewer
      disabled={false}
      filter={{}}
      groupBy={{ groupByVotingMethod: true }}
      autoPreview={false}
    />,
    { apiMock, electionDefinition }
  );

  userEvent.click(await screen.findButton('Load Preview'));
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
    printResult.getByText('Unofficial Full Election Ballot Count Report');
    expect(printResult.getByTestId('footer-total')).toHaveTextContent('5');
  });

  screen.getByText('Unofficial Full Election Ballot Count Report');
  expect(screen.getByTestId('footer-total')).toHaveTextContent('5');
});

test('print failure logging', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  apiMock.expectGetCardCounts(
    {
      filter: {},
      groupBy: { groupByVotingMethod: true },
    },
    MOCK_VOTING_METHOD_CARD_COUNTS
  );

  const logger = fakeLogger();
  renderInAppContext(
    <BallotCountReportViewer
      disabled={false}
      filter={{}}
      groupBy={{ groupByVotingMethod: true }}
      autoPreview
    />,
    { apiMock, electionDefinition, logger }
  );

  await screen.findByText('Unofficial Full Election Ballot Count Report');

  simulateErrorOnNextPrint(new Error('printer broken'));
  userEvent.click(screen.getButton('Print Report'));
  await waitFor(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.TallyReportPrinted,
      'election_manager',
      {
        disposition: 'failure',
        message:
          'User attempted to print a ballot count report, but an error occurred: printer broken',
        filter: '{}',
        groupBy: '{"groupByVotingMethod":true}',
      }
    );
  });
});

test('displays custom filter rather than specific title when necessary', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const filter: Tabulation.Filter = {
    ballotStyleIds: ['1'],
    precinctIds: ['23'],
    votingMethods: ['absentee'],
  };

  apiMock.expectGetCardCounts(
    {
      filter,
      groupBy: {},
    },
    [getMockCardCounts(5, undefined, 10)]
  );

  renderInAppContext(
    <BallotCountReportViewer
      disabled={false}
      filter={filter}
      groupBy={{}}
      autoPreview
    />,
    { apiMock, electionDefinition }
  );

  await screen.findByText('Unofficial Custom Filter Ballot Count Report');
  screen.getByText(hasTextAcrossElements('Voting Method: Absentee'));
  screen.getByText(hasTextAcrossElements('Ballot Style: 1'));
  screen.getByText(hasTextAcrossElements('Precinct: North Lincoln'));
});

test('exporting report PDF', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2023-09-06T21:45:08Z'));
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  const { electionDefinition } = electionFamousNames2021Fixtures;
  apiMock.expectGetCardCounts(
    {
      filter: {},
      groupBy: {
        groupByVotingMethod: true,
      },
    },
    MOCK_VOTING_METHOD_CARD_COUNTS
  );

  renderInAppContext(
    <BallotCountReportViewer
      disabled={false}
      filter={{}}
      groupBy={{
        groupByVotingMethod: true,
      }}
      autoPreview={false}
    />,
    {
      apiMock,
      electionDefinition,
      usbDriveStatus: mockUsbDriveStatus('mounted'),
    }
  );

  await screen.findButton('Load Preview');
  userEvent.click(screen.getButton('Export Report PDF'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Save Unofficial Ballot Count Report');
  within(modal).getByText(
    /ballot-count-report-by-voting-method__2023-09-06_21-45-08\.pdf/
  );
  userEvent.click(within(modal).getButton('Save'));
  await screen.findByText('Saving Unofficial Ballot Count Report');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  await screen.findByText('Unofficial Ballot Count Report Saved');

  expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1);
  await expectPrintToPdf((pdfResult) => {
    pdfResult.getByText('Unofficial Full Election Ballot Count Report');
    expect(pdfResult.getByTestId('footer-total')).toHaveTextContent('5');
  });

  jest.useRealTimers();
});
