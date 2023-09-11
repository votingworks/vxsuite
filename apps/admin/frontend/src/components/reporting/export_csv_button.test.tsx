import userEvent from '@testing-library/user-event';
import { Tabulation } from '@votingworks/types';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { screen, within } from '../../../test/react_testing_library';
import { ExportCsvResultsButton } from './export_csv_button';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { mockUsbDriveStatus } from '../../../test/helpers/mock_usb_drive';

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

  const filter: Tabulation.Filter = {
    votingMethods: ['absentee'],
  };
  const groupBy: Tabulation.GroupBy = {
    groupByPrecinct: true,
  };

  renderInAppContext(
    <ExportCsvResultsButton filter={filter} groupBy={groupBy} />,
    {
      apiMock,
      usbDriveStatus: mockUsbDriveStatus('mounted'),
    }
  );

  userEvent.click(screen.getButton('Export CSV Results'));
  const modal = await screen.findByRole('alertdialog');
  await within(modal).findByText('Save Results');
  within(modal).getByText(
    /absentee-ballots-tally-report-by-precinct__2021-01-01_00-00-00\.csv/
  );

  apiMock.expectExportResultsCsv({
    filter,
    groupBy,
    path: 'test-mount-point/choctaw-county_mock-general-election-choctaw-2020_d6806afc49/reports/absentee-ballots-tally-report-by-precinct__2021-01-01_00-00-00.csv',
  });
  userEvent.click(within(modal).getButton('Save'));
  await screen.findByText('Results Saved');

  userEvent.click(within(modal).getButton('Close'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  jest.useRealTimers();
});

test('disabled by disabled prop', () => {
  renderInAppContext(
    <ExportCsvResultsButton disabled filter={{}} groupBy={{}} />,
    { apiMock }
  );

  expect(screen.getButton('Export CSV Results')).toBeDisabled();
});
