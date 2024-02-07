import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { ok } from '@votingworks/basics';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { screen, within } from '../../../test/react_testing_library';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { ExportWriteInAdjudicationReportPdfButton } from './export_wia_report_pdf_button';

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

  renderInAppContext(<ExportWriteInAdjudicationReportPdfButton />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  userEvent.click(screen.getButton('Export Report PDF'));
  const modal = await screen.findByRole('alertdialog');
  await within(modal).findByText('Save Write-In Adjudication Report');
  within(modal).getByText(
    /unofficial-full-election-write-in-adjudication-report__2021-01-01_00-00-00\.pdf/
  );

  apiMock.apiClient.exportWriteInAdjudicationReportPdf
    .expectCallWith({
      path: 'test-mount-point/choctaw-county_mock-general-election-choctaw-2020_d6806afc49/reports/unofficial-full-election-write-in-adjudication-report__2021-01-01_00-00-00.pdf',
    })
    .resolves(ok([]));
  userEvent.click(within(modal).getButton('Save'));
  await screen.findByText('Write-In Adjudication Report Saved');

  userEvent.click(within(modal).getButton('Close'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  jest.useRealTimers();
});

test('disabled by disabled prop', () => {
  renderInAppContext(<ExportWriteInAdjudicationReportPdfButton disabled />, {
    apiMock,
  });

  expect(screen.getButton('Export Report PDF')).toBeDisabled();
});
