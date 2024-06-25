import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { waitForElementToBeRemoved } from '@testing-library/react';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { TallyReportSpec } from '@votingworks/admin-backend';
import { ok } from '@votingworks/basics';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { screen, within } from '../../../test/react_testing_library';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { TallyReportViewer } from './tally_report_viewer';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.setPrinterStatus({ connected: true });
  apiMock.expectGetCastVoteRecordFileMode('official');
});

afterEach(() => {
  jest.useRealTimers();
  apiMock.assertComplete();
});

const ACTION_BUTTON_LABELS = [
  'Print Report',
  'Export Report PDF',
  'Export Report CSV',
];

const CDF_BUTTON_LABEL = 'Export CDF Report';

const MOCK_REPORT_SPEC: TallyReportSpec = {
  filter: {},
  groupBy: { groupByVotingMethod: true },
  includeSignatureLines: false,
};

test('disabled shows disabled buttons and no preview', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  renderInAppContext(
    <TallyReportViewer
      disabled
      autoGenerateReport={false}
      {...MOCK_REPORT_SPEC}
    />,
    { apiMock, electionDefinition }
  );

  for (const buttonLabel of ACTION_BUTTON_LABELS) {
    expect(screen.getButton(buttonLabel)).toBeDisabled();
  }

  // no preview API call mocked => it's not loading the preview
});

test('when auto-generation is on, it loads the preview automatically', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  apiMock.expectGetTallyReportPreview({
    reportSpec: MOCK_REPORT_SPEC,
    pdfContent: 'Unofficial Lincoln Municipal General Election Tally Report',
  });

  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      autoGenerateReport
      {...MOCK_REPORT_SPEC}
    />,
    { apiMock, electionDefinition }
  );

  await screen.findByText(
    'Unofficial Lincoln Municipal General Election Tally Report'
  );
  expect(
    screen.queryByRole('button', { name: 'Generate Report' })
  ).not.toBeInTheDocument();
  for (const buttonLabel of ACTION_BUTTON_LABELS) {
    expect(screen.getButton(buttonLabel)).toBeEnabled();
  }
  expect(screen.queryButton(CDF_BUTTON_LABEL)).not.toBeInTheDocument();
});

test('when auto-generation is off, it requires a button press to load the report', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      autoGenerateReport={false}
      {...MOCK_REPORT_SPEC}
    />,
    { apiMock, electionDefinition }
  );

  await screen.findButton('Generate Report');
  for (const buttonLabel of ACTION_BUTTON_LABELS) {
    expect(screen.getButton(buttonLabel)).toBeDisabled();
  }

  apiMock.expectGetTallyReportPreview({
    reportSpec: MOCK_REPORT_SPEC,
    pdfContent: 'Unofficial Lincoln Municipal General Election Tally Report',
  });
  userEvent.click(screen.getButton('Generate Report'));
  await screen.findByText(
    'Unofficial Lincoln Municipal General Election Tally Report'
  );
  expect(screen.getButton('Generate Report')).toBeDisabled();
  for (const buttonLabel of ACTION_BUTTON_LABELS) {
    expect(screen.getButton(buttonLabel)).toBeEnabled();
  }
});

test('shows no results warning and prevents actions when no results', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  apiMock.expectGetTallyReportPreview({
    reportSpec: MOCK_REPORT_SPEC,
    warning: { type: 'no-reports-match-filter' },
  });

  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      autoGenerateReport
      {...MOCK_REPORT_SPEC}
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
  apiMock.expectGetTallyReportPreview({
    reportSpec: MOCK_REPORT_SPEC,
    pdfContent: 'Unofficial Lincoln Municipal General Election Tally Report',
  });

  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      autoGenerateReport
      {...MOCK_REPORT_SPEC}
    />,
    { apiMock, electionDefinition }
  );

  await screen.findByText(
    'Unofficial Lincoln Municipal General Election Tally Report'
  );

  const { resolve } = apiMock.expectPrintTallyReport({
    expectCallWith: MOCK_REPORT_SPEC,
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
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2023-09-06T21:45:08'));

  const { electionDefinition } = electionFamousNames2021Fixtures;
  apiMock.expectGetTallyReportPreview({
    reportSpec: MOCK_REPORT_SPEC,
    pdfContent: 'Unofficial Lincoln Municipal General Election Tally Report',
  });

  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      autoGenerateReport
      {...MOCK_REPORT_SPEC}
    />,
    {
      apiMock,
      electionDefinition,
      usbDriveStatus: mockUsbDriveStatus('mounted'),
    }
  );

  await screen.findByText(
    'Unofficial Lincoln Municipal General Election Tally Report'
  );

  userEvent.click(screen.getButton('Export Report PDF'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Save Tally Report');
  within(modal).getByText(
    /unofficial-tally-reports-by-voting-method__2023-09-06_21-45-08\.pdf/
  );

  const { resolve } = apiMock.expectExportTallyReportPdf({
    expectCallWith: {
      path: 'test-mount-point/franklin-county_lincoln-municipal-general-election_20b609abd8/reports/unofficial-tally-reports-by-voting-method__2023-09-06_21-45-08.pdf',
      ...MOCK_REPORT_SPEC,
    },
    returnValue: ok([]),
    deferred: true,
  });
  userEvent.click(within(modal).getButton('Save'));
  await screen.findByText('Saving Tally Report');
  resolve();
  await screen.findByText('Tally Report Saved');
});

test('exporting CSV', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2023-09-06T21:45:08'));

  const { electionDefinition } = electionFamousNames2021Fixtures;
  apiMock.expectGetTallyReportPreview({
    reportSpec: MOCK_REPORT_SPEC,
    pdfContent: 'Unofficial Lincoln Municipal General Election Tally Report',
  });

  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      autoGenerateReport
      {...MOCK_REPORT_SPEC}
    />,
    {
      apiMock,
      electionDefinition,
      usbDriveStatus: mockUsbDriveStatus('mounted'),
    }
  );

  await screen.findByText(
    'Unofficial Lincoln Municipal General Election Tally Report'
  );

  userEvent.click(screen.getButton('Export Report CSV'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Save Tally Report');
  within(modal).getByText(
    /unofficial-tally-report-by-voting-method__2023-09-06_21-45-08\.csv/
  );

  const { resolve } = apiMock.expectExportTallyReportCsv({
    expectCallWith: {
      path: 'test-mount-point/franklin-county_lincoln-municipal-general-election_20b609abd8/reports/unofficial-tally-report-by-voting-method__2023-09-06_21-45-08.csv',
      filter: MOCK_REPORT_SPEC.filter,
      groupBy: MOCK_REPORT_SPEC.groupBy,
    },
    returnValue: ok([]),
    deferred: true,
  });
  userEvent.click(within(modal).getButton('Save'));
  await screen.findByText('Saving Tally Report');
  resolve();
  await screen.findByText('Tally Report Saved');
});

test('when full election report - allows CDF export and includes signature lines', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2023-09-06T21:45:08'));

  const { electionDefinition } = electionFamousNames2021Fixtures;
  apiMock.expectGetTallyReportPreview({
    reportSpec: {
      filter: {},
      groupBy: {},
      includeSignatureLines: true,
    },
    pdfContent: 'Unofficial Lincoln Municipal General Election Tally Report',
  });

  renderInAppContext(
    <TallyReportViewer
      disabled={false}
      autoGenerateReport
      filter={{}}
      groupBy={{}}
    />,
    {
      apiMock,
      electionDefinition,
      usbDriveStatus: mockUsbDriveStatus('mounted'),
    }
  );

  await screen.findByText(
    'Unofficial Lincoln Municipal General Election Tally Report'
  );

  userEvent.click(screen.getButton('Export CDF Report'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Save CDF Election Results Report');
  within(modal).getByText(
    /unofficial-cdf-election-results-report__2023-09-06_21-45-08\.json/
  );

  const { resolve } = apiMock.expectExportCdfReport({
    expectCallWith: {
      path: 'test-mount-point/franklin-county_lincoln-municipal-general-election_20b609abd8/reports/unofficial-cdf-election-results-report__2023-09-06_21-45-08.json',
    },
    returnValue: ok([]),
    deferred: true,
  });
  userEvent.click(within(modal).getButton('Save'));
  await screen.findByText('Saving CDF Election Results Report');
  resolve();
  await screen.findByText('CDF Election Results Report Saved');
});
