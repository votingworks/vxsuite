import React from 'react';
import { electionMinimalExhaustiveSampleDefinition as electionDefinition } from '@votingworks/fixtures';
import { CandidateContest } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { screen } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInsTranscriptionScreen } from './write_ins_transcription_screen';

const contest = electionDefinition.election.contests[0] as CandidateContest;
const onClose = jest.fn();
const saveTranscribedValue = jest.fn();

test('clicking a previously-saved value', async () => {
  renderInAppContext(
    <WriteInsTranscriptionScreen
      election={electionDefinition.election}
      contest={contest}
      transcriptionQueue={4}
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
      saveTranscribedValue={saveTranscribedValue}
    />,
    { electionDefinition }
  );

  // Click a previously-saved transcription
  userEvent.click(await screen.findByText('Mickey Mouse'));
  expect(saveTranscribedValue).toHaveBeenCalledWith('id-174', 'Mickey Mouse');

  await screen.findByTestId('transcribe:id-174');
  userEvent.click(await screen.findByText('Next'));
  await screen.findByTestId('transcribe:id-175');
  userEvent.click(await screen.findByText('Previous'));
  await screen.findByTestId('transcribe:id-174');

  userEvent.click(await screen.findByText('Back to All Write-Ins'));
  expect(onClose).toHaveBeenCalledTimes(1);
});
