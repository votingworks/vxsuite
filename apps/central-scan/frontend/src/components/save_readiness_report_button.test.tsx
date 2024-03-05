import { mockUsbDriveStatus } from '@votingworks/ui';
import userEvent from '@testing-library/user-event';
import { deferred, err, ok } from '@votingworks/basics';
import { ExportDataResult } from '@votingworks/backend';
import { ApiMock, createApiMock } from '../../test/api';
import { renderInAppContext } from '../../test/render_in_app_context';
import { SaveReadinessReportButton } from './save_readiness_report_button';
import { screen } from '../../test/react_testing_library';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('happy path', async () => {
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('no_drive'));
  renderInAppContext(<SaveReadinessReportButton />, { apiMock });

  const button = await screen.findButton('Save Readiness Report');
  expect(screen.queryByRole('alertdialog')).toBeNull();
  userEvent.click(button);

  await screen.findByText('No USB Drive Detected');
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('mounted'));
  await screen.findByRole('heading', { name: 'Save Readiness Report' });

  const { promise, resolve } = deferred<ExportDataResult>();
  apiMock.apiClient.saveReadinessReport.expectCallWith().returns(promise);
  userEvent.click(screen.getButton('Save'));
  await screen.findByText('Saving Report');
  resolve(ok(['readiness-report.pdf']));
  await screen.findByText('Readiness Report Saved');
  screen.getByText('readiness-report.pdf');

  userEvent.click(screen.getButton('Close'));
  expect(screen.queryByRole('alertdialog')).toBeNull();

  // confirm the flow resets after closing
  userEvent.click(button);
  await screen.findByRole('heading', { name: 'Save Readiness Report' });
});

test('error path', async () => {
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('mounted'));
  renderInAppContext(<SaveReadinessReportButton />, { apiMock });

  const button = screen.getButton('Save Readiness Report');
  userEvent.click(button);
  apiMock.apiClient.saveReadinessReport.expectCallWith().resolves(
    err({
      type: 'file-system-error',
      message: 'Unable to save file to the file system.',
    })
  );
  userEvent.click(await screen.findButton('Save'));
  await screen.findByText('Failed to Save Report');
  screen.getByText(
    'Error while saving the readiness report: Unable to save file to the file system.'
  );
  userEvent.click(screen.getButton('Close'));
  expect(screen.queryByRole('alertdialog')).toBeNull();

  // confirm the flow resets after closing
  userEvent.click(button);
  await screen.findByRole('heading', { name: 'Save Readiness Report' });
});
