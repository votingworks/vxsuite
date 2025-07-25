import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus } from '@votingworks/ui';
import type { ExportDataResult } from '@votingworks/admin-backend';
import { ok } from '@votingworks/basics';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { act } from 'react';
import { useMutation } from '@tanstack/react-query';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { screen, within } from '../../../test/react_testing_library';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { ExportFileButton } from './export_file_button';
import { generateReportFilename } from '../../utils/reporting';

let apiMock: ApiMock;

function mockMutate({
  filename,
  echo,
}: {
  filename: string;
  echo: string;
}): Promise<ExportDataResult> {
  return Promise.resolve(ok([filename, echo]));
}

const vitestMockMutate = vi.fn(mockMutate);

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetCastVoteRecordFileMode('official');

  // mocking above is necessary for typing, but it doesn't actually make its
  // way into each test due to mocks resetting automatically, so we need to
  // mock it here as well
  vitestMockMutate.mockImplementation(mockMutate);
});

afterEach(() => {
  apiMock.assertComplete();
  vitestMockMutate.mockReset();
});

function TestComponent({
  echo,
  disabled,
}: {
  echo: string;
  disabled?: boolean;
} & { disabled?: boolean }): JSX.Element {
  const mockMutation = useMutation(vitestMockMutate);

  return (
    <ExportFileButton
      buttonText="Export Me!"
      exportMutation={mockMutation}
      exportParameters={{
        echo,
      }}
      generateFilename={({ election, isTestMode, isOfficialResults, time }) =>
        generateReportFilename({
          election,
          filter: {},
          groupBy: {},
          isTestMode,
          isOfficialResults,
          time,
          type: echo,
          extension: 'txt',
        })
      }
      fileType="sentence case file label"
      fileTypeTitle="Title Case File Label"
      disabled={disabled}
    />
  );
}

test('overall flow', async () => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date('2021-01-01T00:00:00'),
  });

  renderInAppContext(<TestComponent echo="success" />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  const button = await screen.findButton('Export Me!');
  userEvent.click(button);
  const modal = await screen.findByRole('alertdialog');
  await within(modal).findByText('Save Title Case File Label');
  const expectedFileName =
    'unofficial-full-election-success__2021-01-01_00-00-00.txt';
  within(modal).getByText(
    hasTextAcrossElements(
      `Save the sentence case file label as ${expectedFileName} on the inserted USB drive?`
    )
  );

  // confirm that the file timestamp doesn't change while modal is open
  act(() => {
    vi.advanceTimersByTime(10_000);
  });
  within(modal).getByText(
    hasTextAcrossElements(
      `Save the sentence case file label as ${expectedFileName} on the inserted USB drive?`
    )
  );

  userEvent.click(within(modal).getButton('Save'));
  await screen.findByText('Title Case File Label Saved');
  screen.getByText(
    'Sentence case file label successfully saved to the inserted USB drive.'
  );
  userEvent.click(within(modal).getButton('Close'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  expect(vitestMockMutate).toHaveBeenCalledTimes(1);
  expect(vitestMockMutate).toHaveBeenCalledWith({
    filename: 'unofficial-full-election-success__2021-01-01_00-00-00.txt',
    echo: 'success',
  });

  // confirm that, upon re-opening the modal, its state has reset
  userEvent.click(screen.getButton('Export Me!'));
  const newModal = await screen.findByRole('alertdialog');
  within(newModal).getByText('Save Title Case File Label');
  // timestamp is now different, reflecting when we re-opened the modal
  within(newModal).getByText(
    'unofficial-full-election-success__2021-01-01_00-00-10.txt'
  );
  userEvent.click(within(modal).getButton('Close'));

  expect(vitestMockMutate).toHaveBeenCalledTimes(1);
});

test('disabled by disabled prop', () => {
  renderInAppContext(<TestComponent echo="success" disabled />, {
    apiMock,
  });

  expect(screen.getButton('Export Me!')).toBeDisabled();
});
