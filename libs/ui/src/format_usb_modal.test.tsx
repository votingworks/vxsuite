import React from 'react';
import { expect, test, vi } from 'vitest';
import { err, ok, Result } from '@votingworks/basics';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { act } from '@testing-library/react';
import { UsbDriveStatus } from '@votingworks/usb-drive';
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

interface ControlledMockProps {
  initialUsbDriveStatus: UsbDriveStatus;
}

function ControlledMockComponent({
  initialUsbDriveStatus,
}: ControlledMockProps): JSX.Element {
  const [usbDriveStatus, setUsbDriveStatus] = React.useState<UsbDriveStatus>(
    initialUsbDriveStatus
  );
  const mutation = useMutation(
    vi.fn<() => Promise<Result<void, Error>>>().mockImplementation(() => {
      // Simulate drive status going to no_drive mid-format (the flicker bug)
      act(() => setUsbDriveStatus(mockUsbDriveStatus('no_drive')));
      return Promise.resolve(ok());
    })
  );

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
    'USB drive successfully formatted and ejected. It can now be used with VotingWorks components.'
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

test('no usb drive inserted shows prompt', async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <MockComponent usbDriveStatus={mockUsbDriveStatus('no_drive')} />
    </QueryClientProvider>
  );

  userEvent.click(screen.getButton('Format USB Drive'));
  await screen.findByRole('heading', { name: 'No USB Drive Detected' });
  screen.getByText('Insert a USB drive you would like to format.');
  userEvent.click(screen.getButton('Cancel'));
  expect(
    screen.queryByRole('heading', { name: 'No USB Drive Detected' })
  ).toBeNull();
});

test('done screen shown even when status becomes no_drive during formatting', async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <ControlledMockComponent
        initialUsbDriveStatus={mockUsbDriveStatus('error')}
      />
    </QueryClientProvider>
  );

  userEvent.click(screen.getButton('Format USB Drive'));
  await screen.findByRole('heading', { name: 'Format USB Drive' });
  userEvent.click(screen.getButton('Format USB Drive'));

  // Despite status becoming no_drive during formatting, done screen must appear
  await screen.findByText(
    'USB drive successfully formatted and ejected. It can now be used with VotingWorks components.'
  );
});

test('error during formatting', async () => {
  const failMutate = vi
    .fn<() => Promise<Result<void, Error>>>()
    .mockResolvedValue(err(new Error('disk write failed')));

  function ErrorMockComponent(): JSX.Element {
    const mutation = useMutation(failMutate);
    return (
      <FormatUsbButton
        usbDriveStatus={mockUsbDriveStatus('error')}
        formatUsbDriveMutation={mutation}
      />
    );
  }

  render(
    <QueryClientProvider client={queryClient}>
      <ErrorMockComponent />
    </QueryClientProvider>
  );

  userEvent.click(screen.getButton('Format USB Drive'));
  await screen.findByRole('heading', { name: 'Format USB Drive' });
  userEvent.click(screen.getButton('Format USB Drive'));
  await screen.findByRole('heading', { name: 'Failed to Format USB Drive' });
  screen.getByText('Failed to format USB drive: disk write failed');
});
