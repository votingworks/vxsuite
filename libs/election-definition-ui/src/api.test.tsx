import { expect, test, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { DateWithoutTime, err, ok } from '@votingworks/basics';
import type { ElectionInfoUpdate } from '@votingworks/election-definition-backend';
import { LanguageCode } from '@votingworks/types';
import { createMockApiClient, provideApi } from '../test/api_helpers.js';
import { render, screen, waitFor } from '../test/react_testing_library.js';
import { useElectionDefinitionApi } from './election_definition_context.js';

const electionInfoUpdate: ElectionInfoUpdate = {
  electionId: 'election-1',
  type: 'general',
  date: new DateWithoutTime('2026-11-03'),
  title: 'General Election',
  state: 'Demo State',
  jurisdictionName: 'Demo County',
  seal: '',
  languageCodes: [LanguageCode.ENGLISH],
};

function UpdateButton(): JSX.Element {
  const updateElectionInfo =
    useElectionDefinitionApi().updateElectionInfo.useMutation();
  return (
    <button
      type="button"
      onClick={() => updateElectionInfo.mutate(electionInfoUpdate)}
    >
      Update
    </button>
  );
}

test('updateElectionInfo calls invalidateElectionQueries on success', async () => {
  const apiMock = createMockApiClient();
  const invalidateElectionQueries = vi.fn().mockResolvedValue(undefined);
  render(
    provideApi(apiMock, <UpdateButton />, {
      options: { invalidateElectionQueries },
    })
  );

  apiMock.updateElectionInfo
    .expectCallWith(electionInfoUpdate)
    .resolves(err('duplicate-title-and-date'));
  await userEvent.click(screen.getByRole('button', { name: 'Update' }));
  apiMock.assertComplete();
  expect(invalidateElectionQueries).not.toHaveBeenCalled();

  apiMock.updateElectionInfo.expectCallWith(electionInfoUpdate).resolves(ok());
  await userEvent.click(screen.getByRole('button', { name: 'Update' }));
  await waitFor(() =>
    expect(invalidateElectionQueries).toHaveBeenCalledWith(
      expect.anything(),
      'election-1'
    )
  );
  apiMock.assertComplete();
});
