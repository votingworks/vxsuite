import { screen } from '@testing-library/react';
import React from 'react';
import { electionSample as election } from '@votingworks/fixtures';
import { CandidateContest } from '@votingworks/types';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInsTranscriptionScreen } from './write_ins_transcription_screen';

test('write-ins screen', () => {
  const contest = election.contests[0] as CandidateContest;
  renderInAppContext(
    <WriteInsTranscriptionScreen
      election={election}
      contest={contest}
      onClose={jest.fn()}
    />
  );
  screen.getByText('BALLOT IMAGES GO HERE');
});
