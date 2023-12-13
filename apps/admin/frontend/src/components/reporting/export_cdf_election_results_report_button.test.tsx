import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { screen, within } from '../../../test/react_testing_library';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { ExportCdfElectionResultsReportButton } from './export_cdf_election_results_report_button';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetCastVoteRecordFileMode('official');
});

afterEach(() => {
  apiMock.assertComplete();
});

test('calls mutation in happy path', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2021-01-01T00:00:00Z'));

  renderInAppContext(<ExportCdfElectionResultsReportButton />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  userEvent.click(screen.getButton('Export CDF Report'));
  const modal = await screen.findByRole('alertdialog');
  await within(modal).findByText('Save CDF Election Results Report');
  within(modal).getByText(
    /unofficial-cdf-election-results-report__2021-01-01_00-00-00\.json/
  );

  apiMock.expectExportCdfElectionResultsReport({
    path: 'test-mount-point/choctaw-county_mock-general-election-choctaw-2020_d6806afc49/reports/unofficial-cdf-election-results-report__2021-01-01_00-00-00.json',
  });
  userEvent.click(within(modal).getButton('Save'));
  await screen.findByText('CDF Election Results Report Saved');

  userEvent.click(within(modal).getButton('Close'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  jest.useRealTimers();
});

test('disabled by disabled prop', () => {
  renderInAppContext(<ExportCdfElectionResultsReportButton disabled />, {
    apiMock,
  });

  expect(screen.getButton('Export CDF Report')).toBeDisabled();
});
