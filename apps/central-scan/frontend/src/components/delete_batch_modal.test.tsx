import React from 'react';
import userEvent from '@testing-library/user-event';
import { MockApiClient, createMockApiClient, provideApi } from '../../test/api';
import { render, screen, waitFor } from '../../test/react_testing_library';
import { DeleteBatchModal } from './delete_batch_modal';

let mockApiClient: MockApiClient;

beforeEach(() => {
  jest.restoreAllMocks();
  mockApiClient = createMockApiClient();
});

afterEach(() => {
  mockApiClient.assertComplete();
});

test('allows canceling', async () => {
  const onClose = jest.fn();

  render(
    provideApi(
      mockApiClient,
      <DeleteBatchModal batchId="a" batchLabel="Batch 1" onClose={onClose} />
    )
  );

  await screen.findByText('Delete ‘Batch 1’?');
  expect(onClose).not.toHaveBeenCalled();

  userEvent.click(screen.getByText('Cancel'));
  expect(onClose).toHaveBeenCalled();
});

test('closes on success', async () => {
  const onClose = jest.fn();

  render(
    provideApi(
      mockApiClient,
      <DeleteBatchModal batchId="a" batchLabel="Batch 1" onClose={onClose} />
    )
  );

  await screen.findByText('Delete ‘Batch 1’?');
  expect(onClose).not.toHaveBeenCalled();

  mockApiClient.deleteBatch.expectCallWith({ batchId: 'a' }).resolves();
  userEvent.click(screen.getByText('Yes, Delete Batch'));
  await waitFor(() => {
    expect(onClose).toHaveBeenCalled();
  });
});
