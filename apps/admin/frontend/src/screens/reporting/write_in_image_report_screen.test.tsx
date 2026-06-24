import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { ok } from '@votingworks/basics';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import {
  TITLE,
  WriteInImageReportScreen,
} from './write_in_image_report_screen';
import { fireEvent, screen, within } from '../../../test/react_testing_library';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();
const MAYOR_CONTEST_ID = 'mayor';

function selectContest(contestTitle: string) {
  const select = screen.getByRole('combobox');
  fireEvent.keyDown(select, { key: 'ArrowDown' });
  // Option labels are disambiguated (e.g. "Mayor · City of Lincoln"), so match
  // the title as a substring.
  fireEvent.click(screen.getByText(contestTitle, { exact: false }));
}

test('initial state: no contest selected, no actions shown', async () => {
  renderInAppContext(<WriteInImageReportScreen />, {
    electionDefinition,
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  await screen.findByRole('heading', { name: TITLE });
  expect(
    screen.queryByRole('button', { name: 'Print Report' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Export Report PDF' })
  ).not.toBeInTheDocument();
});

test('select contest → preview loads and actions appear', async () => {
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.setPrinterStatus({ connected: true });
  apiMock.expectGetWriteInImageReportPreview(
    MAYOR_CONTEST_ID,
    'Mock Write-In Image Report'
  );
  renderInAppContext(<WriteInImageReportScreen />, {
    electionDefinition,
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  await screen.findByRole('heading', { name: TITLE });
  selectContest('Mayor');

  await screen.findByText('Mock Write-In Image Report');
  screen.getByRole('button', { name: 'Print Report' });
  screen.getByRole('button', { name: 'Export Report PDF' });
});

test('print report', async () => {
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.setPrinterStatus({ connected: true });
  apiMock.expectGetWriteInImageReportPreview(
    MAYOR_CONTEST_ID,
    'Mock Write-In Image Report'
  );
  renderInAppContext(<WriteInImageReportScreen />, {
    electionDefinition,
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  selectContest('Mayor');
  await screen.findByText('Mock Write-In Image Report');

  apiMock.apiClient.printWriteInImageReport
    .expectCallWith({ contestId: MAYOR_CONTEST_ID })
    .resolves();
  userEvent.click(screen.getButton('Print Report'));
  await vi.runOnlyPendingTimersAsync();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

test('export report PDF', async () => {
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.setPrinterStatus({ connected: true });
  apiMock.expectGetWriteInImageReportPreview(
    MAYOR_CONTEST_ID,
    'Mock Write-In Image Report'
  );
  renderInAppContext(<WriteInImageReportScreen />, {
    electionDefinition,
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  selectContest('Mayor');
  await screen.findByText('Mock Write-In Image Report');

  vi.setSystemTime(new Date('2021-01-01T00:00:00.000Z'));
  apiMock.apiClient.exportWriteInImageReportPdf
    .expectCallWith({
      contestId: MAYOR_CONTEST_ID,
      filename:
        'unofficial-write-in-image-report-mayor-2021-01-01T00-00-00.pdf',
    })
    .resolves(ok([]));
  userEvent.click(screen.getButton('Export Report PDF'));
  const exportModal = await screen.findByRole('alertdialog');
  userEvent.click(within(exportModal).getButton('Save'));
  await screen.findByText('Write-In Image Report Saved');
  userEvent.click(within(exportModal).getButton('Close'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

test('contest options are disambiguated by district, party, and term, and sorted by label', () => {
  renderInAppContext(<WriteInImageReportScreen />, {
    electionDefinition:
      electionTwoPartyPrimaryFixtures.readElectionDefinition(),
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  const select = screen.getByRole('combobox');
  fireEvent.keyDown(select, { key: 'ArrowDown' });

  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
    'Zoo Council · District 1 · F · For three years',
    'Zoo Council · District 1 · Ma · For three years',
  ]);
});

test('shows warning and disables actions when PDF is too large', async () => {
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.setPrinterStatus({ connected: true });
  apiMock.apiClient.getWriteInImageReportPreview
    .expectCallWith({ contestId: MAYOR_CONTEST_ID })
    .resolves({ pdf: undefined, warning: { type: 'content-too-large' } });
  renderInAppContext(<WriteInImageReportScreen />, {
    electionDefinition,
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  selectContest('Mayor');
  await screen.findByText('This report is too large to export.');
  for (const buttonLabel of ['Print Report', 'Export Report PDF']) {
    expect(screen.getButton(buttonLabel)).toBeDisabled();
  }
});
