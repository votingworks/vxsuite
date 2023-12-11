import userEvent from '@testing-library/user-event';
import { Admin, Tabulation } from '@votingworks/types';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { screen, within } from '../../../test/react_testing_library';
import { ExportTallyReportCsvButton } from './export_tally_report_csv_button';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';

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

  const filter: Admin.FrontendReportingFilter = {
    votingMethods: ['absentee'],
  };
  const groupBy: Tabulation.GroupBy = {
    groupByPrecinct: true,
  };

  renderInAppContext(
    <ExportTallyReportCsvButton filter={filter} groupBy={groupBy} />,
    {
      apiMock,
      usbDriveStatus: mockUsbDriveStatus('mounted'),
    }
  );

  userEvent.click(screen.getButton('Export Report CSV'));
  const modal = await screen.findByRole('alertdialog');
  await within(modal).findByText('Save Results');
  within(modal).getByText(
    /unofficial-absentee-ballots-tally-report-by-precinct__2021-01-01_00-00-00\.csv/
  );

  apiMock.expectExportTallyReportCsv({
    filter,
    groupBy,
    path: 'test-mount-point/choctaw-county_mock-general-election-choctaw-2020_d6806afc49/reports/unofficial-absentee-ballots-tally-report-by-precinct__2021-01-01_00-00-00.csv',
  });
  userEvent.click(within(modal).getButton('Save'));
  await screen.findByText('Results Saved');

  userEvent.click(within(modal).getButton('Close'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  jest.useRealTimers();
});

test('disabled by disabled prop', () => {
  renderInAppContext(
    <ExportTallyReportCsvButton disabled filter={{}} groupBy={{}} />,
    { apiMock }
  );

  expect(screen.getButton('Export Report CSV')).toBeDisabled();
});
