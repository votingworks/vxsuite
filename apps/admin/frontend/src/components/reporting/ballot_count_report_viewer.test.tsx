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
import { Admin, Tabulation } from '@votingworks/types';
import { act } from 'react-dom/test-utils';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { buildMockCardCounts } from '@votingworks/utils';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { screen, within } from '../../../test/react_testing_library';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { BallotCountReportViewer } from './ballot_count_report_viewer';

let apiMock: ApiMock;

const MOCK_VOTING_METHOD_CARD_COUNTS: Tabulation.GroupList<Tabulation.CardCounts> =
  [
    {
      votingMethod: 'absentee',
      ...buildMockCardCounts(1, undefined, 3),
    },
    {
      votingMethod: 'precinct',
      ...buildMockCardCounts(0, undefined, 1),
    },
  ];

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetScannerBatches([]);
  window.kiosk = fakeKiosk();
});

afterEach(() => {
  apiMock.assertComplete();
  window.kiosk = undefined;
});

const ACTION_BUTTON_LABELS = [
  'Print Report',
  'Export Report PDF',
  'Export Report CSV',
] as const;

test('disabled shows disabled buttons and no preview', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  renderInAppContext(
    <BallotCountReportViewer
      disabled
      filter={{}}
      groupBy={{}}
      includeSheetCounts={false}
      autoGenerateReport={false}
    />,
    { apiMock, electionDefinition }
  );

  for (const buttonLabel of ACTION_BUTTON_LABELS) {
    expect(screen.getButton(buttonLabel)).toBeDisabled();
  }
});

test('when auto-generation is on, it loads the preview automatically', async () => {
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
      includeSheetCounts={false}
      autoGenerateReport
    />,
    { apiMock, electionDefinition }
  );

  await screen.findByText('Unofficial Full Election Ballot Count Report');
  expect(screen.getByTestId('footer-ballot-count-total')).toHaveTextContent(
    '5'
  );

  expect(
    screen.queryByRole('button', { name: 'Generate Report' })
  ).not.toBeInTheDocument();
  for (const buttonLabel of ACTION_BUTTON_LABELS) {
    expect(screen.getButton(buttonLabel)).toBeEnabled();
  }
});

test('when auto-generation is off, it requires a button press to load the report', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

  renderInAppContext(
    <BallotCountReportViewer
      disabled={false}
      filter={{}}
      groupBy={{
        groupByVotingMethod: true,
      }}
      includeSheetCounts={false}
      autoGenerateReport={false}
    />,
    { apiMock, electionDefinition }
  );

  await screen.findButton('Generate Report');
  for (const buttonLabel of ACTION_BUTTON_LABELS) {
    expect(screen.getButton(buttonLabel)).toBeDisabled();
  }
  expect(
    screen.queryByText('Unofficial Full Election Ballot Count Report')
  ).not.toBeInTheDocument();

  apiMock.expectGetCardCounts(
    {
      filter: {},
      groupBy: { groupByVotingMethod: true },
    },
    MOCK_VOTING_METHOD_CARD_COUNTS
  );

  userEvent.click(screen.getButton('Generate Report'));
  await screen.findByText('Unofficial Full Election Ballot Count Report');
  expect(screen.getByTestId('footer-ballot-count-total')).toHaveTextContent(
    '5'
  );
  expect(screen.getButton('Generate Report')).toBeDisabled();
  for (const buttonLabel of ACTION_BUTTON_LABELS) {
    expect(screen.getButton(buttonLabel)).toBeEnabled();
  }
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
      includeSheetCounts={false}
      autoGenerateReport
    />,
    { apiMock, electionDefinition }
  );

  await screen.findByText(
    'The current report parameters do not match any ballots.'
  );

  for (const buttonLabel of [
    'Print Report',
    'Export Report PDF',
    'Export Report CSV',
  ]) {
    expect(screen.getButton(buttonLabel)).toBeDisabled();
  }
});

test('printing report', async () => {
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
      includeSheetCounts={false}
      autoGenerateReport
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
    expect(
      printResult.getByTestId('footer-ballot-count-total')
    ).toHaveTextContent('5');
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
      includeSheetCounts={false}
      autoGenerateReport
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
  const filter: Admin.FrontendReportingFilter = {
    ballotStyleIds: ['1'],
    precinctIds: ['23'],
    votingMethods: ['absentee'],
  };

  apiMock.expectGetCardCounts(
    {
      filter,
      groupBy: {},
    },
    [buildMockCardCounts(5, undefined, 10)]
  );

  renderInAppContext(
    <BallotCountReportViewer
      disabled={false}
      filter={filter}
      groupBy={{}}
      includeSheetCounts={false}
      autoGenerateReport
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
      includeSheetCounts={false}
      autoGenerateReport
    />,
    {
      apiMock,
      electionDefinition,
      usbDriveStatus: mockUsbDriveStatus('mounted'),
    }
  );

  await waitFor(() => {
    expect(screen.getButton('Export Report PDF')).toBeEnabled();
  });
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
    expect(
      pdfResult.getByTestId('footer-ballot-count-total')
    ).toHaveTextContent('5');
  });

  jest.useRealTimers();
});
