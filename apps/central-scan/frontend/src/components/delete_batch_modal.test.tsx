import userEvent from '@testing-library/user-event';
import { ApiMock, createApiMock, provideApi } from '../../test/api';
import { render, screen, waitFor } from '../../test/react_testing_library';
import { DeleteBatchModal } from './delete_batch_modal';

let apiMock: ApiMock;

beforeEach(() => {
  jest.restoreAllMocks();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('allows canceling', async () => {
  const onClose = jest.fn();

  render(
    provideApi(
      apiMock,
      <DeleteBatchModal batchId="a" batchLabel="Batch 1" onClose={onClose} />
    )
  );

  await screen.findByText('Delete ‘Batch 1’');
  expect(onClose).not.toHaveBeenCalled();

  userEvent.click(screen.getByText('Cancel'));
  expect(onClose).toHaveBeenCalled();
});

test('closes on success', async () => {
  const onClose = jest.fn();

  render(
    provideApi(
      apiMock,
      <DeleteBatchModal batchId="a" batchLabel="Batch 1" onClose={onClose} />
    )
  );

  await screen.findByText('Delete ‘Batch 1’');
  expect(onClose).not.toHaveBeenCalled();

  apiMock.expectDeleteBatch({ batchId: 'a' });
  userEvent.click(screen.getByText('Delete Batch'));
  await waitFor(() => {
    expect(onClose).toHaveBeenCalled();
  });
});
