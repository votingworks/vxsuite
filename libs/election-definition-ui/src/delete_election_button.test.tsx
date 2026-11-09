import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import {
  createMockApiClient,
  type MockApiClient,
  provideApi,
} from '../test/api_helpers.js';
import { render, screen, waitFor } from '../test/react_testing_library.js';
import { DeleteElectionButton } from './delete_election_button.js';

const electionId = 'election-1';

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('confirms before deleting', async () => {
  const onDeleted = vi.fn();
  const invalidateElectionListQueries = vi.fn().mockResolvedValue(undefined);
  render(
    provideApi(
      apiMock,
      <DeleteElectionButton electionId={electionId} onDeleted={onDeleted} />,
      { options: { invalidateElectionListQueries } }
    )
  );

  await userEvent.click(screen.getButton('Delete Election'));
  screen.getByText(
    'Are you sure you want to delete this election? This action cannot be undone.'
  );
  await userEvent.click(screen.getButton('Cancel'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );

  await userEvent.click(screen.getButton('Delete Election'));
  apiMock.deleteElection.expectCallWith({ electionId }).resolves();
  await userEvent.click(screen.getButton('Delete'));
  await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  expect(invalidateElectionListQueries).toHaveBeenCalled();
});
