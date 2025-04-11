import { expect, test, vi } from 'vitest';
import { ok, Result } from '@votingworks/basics';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library';
import { FormatUsbButton, FormatUsbButtonProps } from './format_usb_modal';
import { mockUsbDriveStatus } from './test-utils/mock_usb_drive';
import { QUERY_CLIENT_DEFAULT_OPTIONS } from './react_query';

const mockMutate = vi
  .fn<() => Promise<Result<void, Error>>>()
  .mockResolvedValue(ok());

const queryClient = new QueryClient({
  defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS,
});

function MockComponent({
  usbDriveStatus,
}: Omit<FormatUsbButtonProps, 'formatUsbDriveMutation'>): JSX.Element {
  const mutation = useMutation(mockMutate);

  return (
    <FormatUsbButton
      usbDriveStatus={usbDriveStatus}
      formatUsbDriveMutation={mutation}
    />
  );
}

test('formatting', async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <MockComponent usbDriveStatus={mockUsbDriveStatus('error')} />
    </QueryClientProvider>
  );

  userEvent.click(screen.getButton('Format USB Drive'));
  await screen.findByRole('heading', { name: 'Format USB Drive' });
  screen.getByText(
    'Formatting will delete all files on the USB drive. Back up USB drive files before formatting.'
  );
  userEvent.click(screen.getButton('Format USB Drive'));
  await screen.findByText(
    'USB drive successfully formatted and ejected. It can now be used with VxSuite components.'
  );
  expect(mockMutate).toHaveBeenCalledOnce();
});

test('modal open and close', async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <MockComponent usbDriveStatus={mockUsbDriveStatus('error')} />
    </QueryClientProvider>
  );

  userEvent.click(screen.getButton('Format USB Drive'));
  await screen.findByRole('heading', { name: 'Format USB Drive' });
  userEvent.click(screen.getButton('Close'));
  expect(
    screen.queryByRole('heading', { name: 'Format USB Drive' })
  ).toBeNull();
});

test('already-formatted usb drives', async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <MockComponent usbDriveStatus={mockUsbDriveStatus('mounted')} />
    </QueryClientProvider>
  );

  userEvent.click(screen.getButton('Format USB Drive'));
  await screen.findByRole('heading', { name: 'Format USB Drive' });
  screen.getByText('already compatible');
});
