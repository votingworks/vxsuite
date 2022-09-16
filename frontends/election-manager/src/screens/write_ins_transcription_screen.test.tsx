import { screen } from '@testing-library/react';
import React from 'react';
import fetchMock from 'fetch-mock';
import { electionMinimalExhaustiveSampleDefinition as electionDefinition } from '@votingworks/fixtures';
import { CandidateContest } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInsTranscriptionScreen } from './write_ins_transcription_screen';
import { ElectionManagerStoreMemoryBackend } from '../lib/backends';

const contest = electionDefinition.election.contests[0] as CandidateContest;
const onClose = jest.fn();
const onListAll = jest.fn();
const saveTranscribedValue = jest.fn();

beforeEach(() => {
  fetchMock.mock();
});

test('clicking a previously-saved value', async () => {
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition,
  });

  renderInAppContext(
    <WriteInsTranscriptionScreen
      election={electionDefinition.election}
      contest={contest}
      adjudications={[
        {
          contestId: 'best-animal-mammal',
          transcribedValue: '',
          id: 'id-174',
        },
        {
          contestId: 'best-animal-mammal',
          transcribedValue: 'Mickey Mouse',
          id: 'id-175',
        },
      ]}
      onClose={onClose}
      onListAll={onListAll}
      saveTranscribedValue={saveTranscribedValue}
    />,
    { backend, electionDefinition }
  );

  // Click a previously-saved transcription
  userEvent.click(await screen.findByText('Mickey Mouse'));
  expect(saveTranscribedValue).toHaveBeenCalledWith('id-174', 'Mickey Mouse');

  userEvent.click(await screen.findByText('List All'));
  expect(onListAll).toHaveBeenCalledTimes(1);

  await screen.findByTestId('transcribe:id-174');
  userEvent.click(await screen.findByText('Next'));
  await screen.findByTestId('transcribe:id-175');
  userEvent.click(await screen.findByText('Previous'));
  await screen.findByTestId('transcribe:id-174');

  userEvent.click(await screen.findByText('Exit'));
  expect(onClose).toHaveBeenCalledTimes(1);
});
