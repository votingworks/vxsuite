import { screen } from '@testing-library/react';
import React from 'react';
import { electionMinimalExhaustiveSampleDefinition as electionDefinition } from '@votingworks/fixtures';
import { CandidateContest } from '@votingworks/types';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInsTranscriptionScreen } from './write_ins_transcription_screen';

test('write-ins screen', () => {
  const contest = electionDefinition.election.contests[0] as CandidateContest;
  const onClickNext = jest.fn();
  const onClickPrevious = jest.fn();
  const onClose = jest.fn();
  const onListAll = jest.fn();
  const saveTranscribedValue = jest.fn();

  renderInAppContext(
    <WriteInsTranscriptionScreen
      election={electionDefinition.election}
      contest={contest}
      ballotIdxBeingAdjudicated={0}
      ballotsBeingAdjudicated={[]}
      onClickNext={onClickNext}
      onClickPrevious={onClickPrevious}
      onClose={onClose}
      onListAll={onListAll}
      saveTranscribedValue={saveTranscribedValue}
    />,
    { electionDefinition }
  );
  screen.getByText('BALLOT IMAGES GO HERE');

  screen.getByText('Mickey Mouse').click();
  expect(saveTranscribedValue).toHaveBeenCalledWith('Mickey Mouse');

  screen.getByText('List All').click();
  expect(onListAll).toHaveBeenCalledTimes(1);

  screen.getByText('Previous').click();
  expect(onClickPrevious).toHaveBeenCalledTimes(1);

  screen.getByText('Next').click();
  expect(onClickNext).toHaveBeenCalledTimes(1);

  screen.getByText('Exit').click();
  expect(onClose).toHaveBeenCalledTimes(1);
});
