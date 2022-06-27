import { screen, waitFor } from '@testing-library/react';
import React from 'react';
import fetchMock from 'fetch-mock';
import { electionMinimalExhaustiveSampleDefinition as electionDefinition } from '@votingworks/fixtures';
import { CandidateContest } from '@votingworks/types';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInsTranscriptionScreen } from './write_ins_transcription_screen';

describe('write-ins screen', () => {
  const contest = electionDefinition.election.contests[0] as CandidateContest;
  const onClickNext = jest.fn();
  const onClickPrevious = jest.fn();
  const onClose = jest.fn();
  const onListAll = jest.fn();
  const saveTranscribedValue = jest.fn();

  beforeEach(() => {
    fetchMock.mock();
    fetchMock.get('/admin/write-ins/adjudications/contestId/count', [
      { contestId: 'zoo-council-mammal', adjudicationCount: 3 },
    ]);
    fetchMock.get('/admin/write-ins/transcribed-values', [
      'Daffy',
      'Mickey Mouse',
    ]);
    fetchMock.get('/admin/write-ins/adjudication/id-174', [
      {
        contestId: 'best-animal-mammal',
        transcribedValue: '',
        id: 'id-174',
      },
    ]);
  });

  test('clicking a previously-saved value', async () => {
    renderInAppContext(
      <WriteInsTranscriptionScreen
        election={electionDefinition.election}
        contest={contest}
        paginationIdx={0}
        adjudications={[
          {
            contestId: 'best-animal-mammal',
            transcribedValue: '',
            id: 'id-174',
          },
        ]}
        onClickNext={onClickNext}
        onClickPrevious={onClickPrevious}
        onClose={onClose}
        onListAll={onListAll}
        saveTranscribedValue={saveTranscribedValue}
      />,
      { electionDefinition }
    );
    screen.getByText('BALLOT IMAGES GO HERE');

    // Click a previously-saved transcription
    await waitFor(() => {
      screen.getByText('Mickey Mouse').click();
    });
    expect(saveTranscribedValue).toHaveBeenCalledWith('id-174', 'Mickey Mouse');

    screen.getByText('List All').click();
    expect(onListAll).toHaveBeenCalledTimes(1);

    screen.getByText('Previous').click();
    expect(onClickPrevious).toHaveBeenCalledTimes(1);

    screen.getByText('Next').click();
    expect(onClickNext).toHaveBeenCalledTimes(1);

    screen.getByText('Exit').click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
