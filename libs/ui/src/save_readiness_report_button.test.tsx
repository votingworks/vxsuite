import userEvent from '@testing-library/user-event';
import { deferred, err, ok } from '@votingworks/basics';
import { ExportDataResult } from '@votingworks/backend';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query';
import {
  SaveReadinessReportButton,
  SaveReadinessReportProps,
} from './save_readiness_report_button';

import { render, screen } from '../test/react_testing_library';
import { QUERY_CLIENT_DEFAULT_OPTIONS } from './react_query';
import { mockUsbDriveStatus } from './test-utils/mock_usb_drive';

function mockMutate(): Promise<ExportDataResult> {
  return Promise.resolve(ok(['mock-file.pdf']));
}

const jestMockMutate = jest.fn(mockMutate);

const queryClient = new QueryClient({
  defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS,
});

function MockComponent({
  usbDriveStatus,
  usbImage,
}: Omit<SaveReadinessReportProps, 'saveReadinessReportMutation'>): JSX.Element {
  const mutation = useMutation(jestMockMutate);
  return (
    <SaveReadinessReportButton
      saveReadinessReportMutation={mutation}
      usbDriveStatus={usbDriveStatus}
      usbImage={usbImage}
    />
  );
}

test('USB drive not mounted', async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <MockComponent
        usbDriveStatus={mockUsbDriveStatus('no_drive')}
        usbImage={<img alt="usb" />}
      />
    </QueryClientProvider>
  );

  userEvent.click(screen.getButton('Save Readiness Report'));
  await screen.findByRole('heading', { name: 'No USB Drive Detected' });
  screen.getByText('Insert a USB drive in order to save the readiness report.');
  screen.getByAltText('usb'); // confirm passed USB image is displayed
});

test('happy path', async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <MockComponent usbDriveStatus={mockUsbDriveStatus('mounted')} />
    </QueryClientProvider>
  );

  userEvent.click(screen.getButton('Save Readiness Report'));
  await screen.findByRole('heading', { name: 'Save Readiness Report' });

  const { resolve, promise } = deferred<ExportDataResult>();
  jestMockMutate.mockReturnValue(promise);
  userEvent.click(screen.getButton('Save'));
  await screen.findByText('Saving Report');

  resolve(ok(['mock-file.pdf']));
  await screen.findByRole('heading', { name: 'Readiness Report Saved' });
  screen.getByText(/mock-file.pdf/);

  userEvent.click(screen.getButton('Close'));
});

test('error path', async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <MockComponent usbDriveStatus={mockUsbDriveStatus('mounted')} />
    </QueryClientProvider>
  );

  userEvent.click(screen.getButton('Save Readiness Report'));
  await screen.findByRole('heading', { name: 'Save Readiness Report' });

  const { resolve, promise } = deferred<ExportDataResult>();
  jestMockMutate.mockReturnValue(promise);
  userEvent.click(screen.getButton('Save'));
  await screen.findByText('Saving Report');

  resolve(
    err({
      type: 'missing-usb-drive',
      message: 'No USB drive found',
    })
  );
  await screen.findByRole('heading', { name: 'Failed to Save Report' });
  screen.getByText(
    'Error while saving the readiness report: No USB drive found'
  );
});

test('mutation resets on close', async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <MockComponent usbDriveStatus={mockUsbDriveStatus('mounted')} />
    </QueryClientProvider>
  );

  userEvent.click(screen.getButton('Save Readiness Report'));
  await screen.findByRole('heading', { name: 'Save Readiness Report' });

  jestMockMutate.mockResolvedValueOnce(ok(['mock-file.pdf']));
  userEvent.click(screen.getButton('Save'));
  await screen.findByRole('heading', { name: 'Readiness Report Saved' });
  screen.getByText(/mock-file.pdf/);

  userEvent.click(screen.getButton('Close'));

  userEvent.click(await screen.findButton('Save Readiness Report'));
  await screen.findByRole('heading', { name: 'Save Readiness Report' });
});
