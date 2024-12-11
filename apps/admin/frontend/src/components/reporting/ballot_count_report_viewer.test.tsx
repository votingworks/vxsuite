import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { waitForElementToBeRemoved } from '@testing-library/react';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { BallotCountReportSpec } from '@votingworks/admin-backend';
import { ok } from '@votingworks/basics';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { screen, within } from '../../../test/react_testing_library';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { BallotCountReportViewer } from './ballot_count_report_viewer';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.setPrinterStatus({ connected: true });
  apiMock.expectGetCastVoteRecordFileMode('official');
});

afterEach(() => {
  vi.useRealTimers();
  apiMock.assertComplete();
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

  // no preview API call mocked => it's not loading the preview
});

test('when auto-generation is on, it loads the preview automatically', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  apiMock.expectGetBallotCountReportPreview({
    reportSpec: {
      filter: {},
      groupBy: { groupByVotingMethod: true },
      includeSheetCounts: false,
    },
    pdfContent: 'Unofficial Full Election Ballot Count Report',
  });

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

  apiMock.expectGetBallotCountReportPreview({
    reportSpec: {
      filter: {},
      groupBy: { groupByVotingMethod: true },
      includeSheetCounts: false,
    },
    pdfContent: 'Unofficial Full Election Ballot Count Report',
  });

  userEvent.click(screen.getButton('Generate Report'));
  await screen.findByText('Unofficial Full Election Ballot Count Report');
  expect(screen.getButton('Generate Report')).toBeDisabled();
  for (const buttonLabel of ACTION_BUTTON_LABELS) {
    expect(screen.getButton(buttonLabel)).toBeEnabled();
  }
});

test('shows returned warnings, and disables actions if no report', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  apiMock.expectGetBallotCountReportPreview({
    reportSpec: {
      filter: {},
      groupBy: { groupByBatch: true },
      includeSheetCounts: false,
    },
    warning: {
      type: 'no-reports-match-filter',
    },
    pdfContent: undefined,
  });

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

test('shows warning and prevents actions when PDF is too large', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  apiMock.expectGetBallotCountReportPreview({
    reportSpec: {
      filter: {},
      groupBy: { groupByBatch: true },
      includeSheetCounts: false,
    },
    warning: {
      type: 'content-too-large',
    },
    pdfContent: undefined,
  });

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
    'This report is too large to be exported as a PDF. You may export the report as a CSV instead.'
  );

  for (const buttonLabel of ['Print Report', 'Export Report PDF']) {
    expect(screen.getButton(buttonLabel)).toBeDisabled();
  }
  expect(screen.getButton('Export Report CSV')).toBeEnabled();
});

test('printing report', async () => {
  vi.useFakeTimers();
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const reportSpec: BallotCountReportSpec = {
    filter: {},
    groupBy: { groupByVotingMethod: true },
    includeSheetCounts: false,
  };
  apiMock.expectGetBallotCountReportPreview({
    reportSpec,
    pdfContent: 'Unofficial Full Election Ballot Count Report',
  });

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

  const { resolve } = apiMock.expectPrintBallotCountReport({
    expectCallWith: reportSpec,
    returnValue: undefined,
    deferred: true,
  });
  userEvent.click(screen.getButton('Print Report'));
  const modal = await screen.findByRole('alertdialog');
  await within(modal).findByText('Printing');
  resolve();
  await waitForElementToBeRemoved(screen.queryByRole('alertdialog'));
});

test('exporting PDF', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2023-09-06T21:45:08'));

  const { electionDefinition } = electionFamousNames2021Fixtures;
  const reportSpec: BallotCountReportSpec = {
    filter: {},
    groupBy: { groupByVotingMethod: true },
    includeSheetCounts: false,
  };
  apiMock.expectGetBallotCountReportPreview({
    reportSpec,
    pdfContent: 'Unofficial Full Election Ballot Count Report',
  });

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

  await screen.findByText('Unofficial Full Election Ballot Count Report');

  userEvent.click(screen.getButton('Export Report PDF'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Save Ballot Count Report');
  within(modal).getByText(
    /unofficial-ballot-count-report-by-voting-method__2023-09-06_21-45-08\.pdf/
  );

  const { resolve } = apiMock.expectExportBallotCountReportPdf({
    expectCallWith: {
      path: 'test-mount-point/franklin-county_lincoln-municipal-general-election_8ff0a69bd9/reports/unofficial-ballot-count-report-by-voting-method__2023-09-06_21-45-08.pdf',
      ...reportSpec,
    },
    returnValue: ok([]),
    deferred: true,
  });
  userEvent.click(within(modal).getButton('Save'));
  await screen.findByText('Saving Ballot Count Report');
  resolve();
  await screen.findByText('Ballot Count Report Saved');
});

test('exporting CSV', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2023-09-06T21:45:08'));

  const { electionDefinition } = electionFamousNames2021Fixtures;
  const reportSpec: BallotCountReportSpec = {
    filter: {},
    groupBy: { groupByVotingMethod: true },
    includeSheetCounts: false,
  };
  apiMock.expectGetBallotCountReportPreview({
    reportSpec,
    pdfContent: 'Unofficial Full Election Ballot Count Report',
  });

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

  await screen.findByText('Unofficial Full Election Ballot Count Report');

  userEvent.click(screen.getButton('Export Report CSV'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Save Ballot Count Report');
  within(modal).getByText(
    /unofficial-ballot-count-report-by-voting-method__2023-09-06_21-45-08\.csv/
  );

  const { resolve } = apiMock.expectExportBallotCountReportCsv({
    expectCallWith: {
      path: 'test-mount-point/franklin-county_lincoln-municipal-general-election_8ff0a69bd9/reports/unofficial-ballot-count-report-by-voting-method__2023-09-06_21-45-08.csv',
      ...reportSpec,
    },
    returnValue: ok([]),
    deferred: true,
  });
  userEvent.click(within(modal).getButton('Save'));
  await screen.findByText('Saving Ballot Count Report');
  resolve();
  await screen.findByText('Ballot Count Report Saved');
});
