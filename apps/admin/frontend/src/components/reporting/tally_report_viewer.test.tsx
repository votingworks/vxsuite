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
import { Admin } from '@votingworks/types';
import { act } from 'react-dom/test-utils';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { buildSimpleMockTallyReportResults } from '@votingworks/utils';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { screen, within } from '../../../test/react_testing_library';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { TallyReportViewer } from './tally_report_viewer';

let apiMock: ApiMock;

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
];

test('disabled shows disabled buttons and no preview', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  renderInAppContext(
    <TallyReportViewer
      disabled
      filter={{}}
      groupBy={{}}
      autoGenerateReport={false}
    />,
    { apiMock, electionDefinition }
  );

  for (const buttonLabel of ACTION_BUTTON_LABELS) {
    expect(screen.getButton(buttonLabel)).toBeDisabled();
  }
});

test('when auto-generation is on, it loads the preview automatically', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { election } = electionDefinition;
  apiMock.expectGetResultsForTallyReports(
    {
      filter: {},
      groupBy: {},
    },
    [
      buildSimpleMockTallyReportResults({
        election,
        scannedBallotCount: 10,
      }),
    ]
  );

  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      filter={{}}
      groupBy={{}}
      autoGenerateReport
    />,
    { apiMock, electionDefinition }
  );

  await screen.findByText(
    'Unofficial Lincoln Municipal General Election Tally Report'
  );
  expect(screen.getByTestId('total-ballot-count')).toHaveTextContent('10');
  expect(
    screen.queryByRole('button', { name: 'Generate Report' })
  ).not.toBeInTheDocument();
  for (const buttonLabel of ACTION_BUTTON_LABELS) {
    expect(screen.getButton(buttonLabel)).toBeEnabled();
  }
});

test('when auto-generation is off, it requires a button press to load the report', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { election } = electionDefinition;

  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      filter={{}}
      groupBy={{}}
      autoGenerateReport={false}
    />,
    { apiMock, electionDefinition }
  );

  await screen.findButton('Generate Report');
  for (const buttonLabel of ACTION_BUTTON_LABELS) {
    expect(screen.getButton(buttonLabel)).toBeDisabled();
  }
  expect(
    screen.queryByText(
      'Unofficial Lincoln Municipal General Election Tally Report'
    )
  ).not.toBeInTheDocument();

  apiMock.expectGetResultsForTallyReports(
    {
      filter: {},
      groupBy: {},
    },
    [
      buildSimpleMockTallyReportResults({
        election,
        scannedBallotCount: 10,
      }),
    ]
  );
  userEvent.click(screen.getButton('Generate Report'));
  await screen.findByText(
    'Unofficial Lincoln Municipal General Election Tally Report'
  );
  expect(screen.getByTestId('total-ballot-count')).toHaveTextContent('10');
  expect(screen.getButton('Generate Report')).toBeDisabled();
  for (const buttonLabel of ACTION_BUTTON_LABELS) {
    expect(screen.getButton(buttonLabel)).toBeEnabled();
  }
});

test('shows no results warning when no results', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  apiMock.expectGetResultsForTallyReports(
    {
      filter: {},
      groupBy: { groupByBatch: true },
    },
    []
  );

  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      filter={{}}
      groupBy={{ groupByBatch: true }}
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
  const { election } = electionDefinition;
  apiMock.expectGetResultsForTallyReports(
    {
      filter: {},
      groupBy: {},
    },
    [
      buildSimpleMockTallyReportResults({
        election,
        scannedBallotCount: 10,
      }),
    ]
  );

  const logger = fakeLogger();
  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      filter={{}}
      groupBy={{}}
      autoGenerateReport
    />,
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
      message: 'User printed a tally report.',
      filter: '{}',
      groupBy: '{}',
    }
  );
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
      buildSimpleMockTallyReportResults({
        election,
        scannedBallotCount: 10,
      }),
    ]
  );

  const logger = fakeLogger();
  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      filter={{}}
      groupBy={{}}
      autoGenerateReport
    />,
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
          'User attempted to print a tally report, but an error occurred: printer broken',
        filter: '{}',
        groupBy: '{}',
      }
    );
  });
});

test('displays custom filter rather than specific title when necessary', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { election } = electionDefinition;
  const filter: Admin.FrontendReportingFilter = {
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
      buildSimpleMockTallyReportResults({
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
      autoGenerateReport
    />,
    { apiMock, electionDefinition }
  );

  await screen.findByText('Unofficial Custom Filter Tally Report');
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
  const { election } = electionDefinition;
  apiMock.expectGetResultsForTallyReports(
    {
      filter: {},
      groupBy: {
        groupByVotingMethod: true,
        groupByPrecinct: true,
      },
    },
    [
      buildSimpleMockTallyReportResults({
        election,
        scannedBallotCount: 10,
      }),
    ]
  );

  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      filter={{}}
      groupBy={{
        groupByVotingMethod: true,
        groupByPrecinct: true,
      }}
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
  within(modal).getByText('Save Unofficial Tally Report');
  within(modal).getByText(
    /tally-reports-by-precinct-and-voting-method__2023-09-06_21-45-08\.pdf/
  );
  userEvent.click(within(modal).getButton('Save'));
  await screen.findByText('Saving Unofficial Tally Report');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  await screen.findByText('Unofficial Tally Report Saved');

  expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1);
  await expectPrintToPdf((pdfResult) => {
    pdfResult.getByText(
      'Unofficial Lincoln Municipal General Election Tally Report'
    );
    expect(pdfResult.getByTestId('total-ballot-count')).toHaveTextContent('10');
  });

  userEvent.click(screen.getButton('Close'));

  jest.useRealTimers();
});
