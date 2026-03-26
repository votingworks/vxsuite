import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { ok } from '@votingworks/basics';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { TITLE, VoterTurnoutReportScreen } from './voter_turnout_report_screen';
import { screen, within } from '../../../test/react_testing_library';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const electionDefinition = readElectionTwoPartyPrimaryDefinition();

test('renders report preview and heading', async () => {
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.setPrinterStatus({ connected: true });
  apiMock.expectGetVoterTurnoutReportPreview('Mock Voter Turnout Report');
  renderInAppContext(<VoterTurnoutReportScreen />, {
    electionDefinition,
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  await screen.findByText('Mock Voter Turnout Report');
  await screen.findByRole('heading', { name: TITLE });
  expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
    'href',
    '/reports'
  );
});

test('print report', async () => {
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.setPrinterStatus({ connected: true });
  apiMock.expectGetVoterTurnoutReportPreview('Mock Voter Turnout Report');
  renderInAppContext(<VoterTurnoutReportScreen />, {
    electionDefinition,
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  await screen.findByText('Mock Voter Turnout Report');

  apiMock.apiClient.printVoterTurnoutReport.expectCallWith().resolves();
  userEvent.click(screen.getButton('Print Report'));
  await vi.runOnlyPendingTimersAsync();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

test('export report PDF', async () => {
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.setPrinterStatus({ connected: true });
  apiMock.expectGetVoterTurnoutReportPreview('Mock Voter Turnout Report');
  renderInAppContext(<VoterTurnoutReportScreen />, {
    electionDefinition,
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  await screen.findByText('Mock Voter Turnout Report');

  vi.setSystemTime(new Date('2021-01-01T00:00:00'));
  apiMock.apiClient.exportVoterTurnoutReportPdf
    .expectCallWith({
      filename:
        'unofficial-full-election-voter-turnout-report__2021-01-01_00-00-00.pdf',
    })
    .resolves(ok([]));
  userEvent.click(screen.getButton('Export Report PDF'));
  const exportModal = await screen.findByRole('alertdialog');
  userEvent.click(within(exportModal).getButton('Save'));
  await screen.findByText('Voter Turnout Report Saved');
  userEvent.click(within(exportModal).getButton('Close'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

test('shows warning and disables actions when PDF is too large', async () => {
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.setPrinterStatus({ connected: true });
  apiMock.apiClient.getVoterTurnoutReportPreview.expectCallWith().resolves({
    pdf: undefined,
    warning: { type: 'content-too-large' },
  });
  renderInAppContext(<VoterTurnoutReportScreen />, {
    electionDefinition,
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  await screen.findByRole('heading', { name: TITLE });
  await screen.findByText('This report is too large to export.');
  for (const buttonLabel of ['Print Report', 'Export Report PDF']) {
    expect(screen.getButton(buttonLabel)).toBeDisabled();
  }
});
