import { screen } from '@testing-library/react';
import React from 'react';
import { electionMinimalExhaustiveSampleDefinition as electionDefinition } from '@votingworks/fixtures';
import { CandidateContest, CastVoteRecord } from '@votingworks/types';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInsTranscriptionScreen } from './write_ins_transcription_screen';

test('write-ins screen', () => {
  const contest = electionDefinition.election.contests[0] as CandidateContest;
  const onClickNext = jest.fn();
  const onClickPrevious = jest.fn();
  const onClose = jest.fn();
  const onListAll = jest.fn();
  const saveTranscribedValue = jest.fn();

  const ballotsBeingAdjudicated: CastVoteRecord[] = [
    {
      _ballotId: unsafeParse(BallotIdSchema, 'id-174'),
      _ballotType: 'absentee',
      _precinctId: 'precinct-1',
      _ballotStyleId: '3C',
      _testBallot: true,
      _scannerId: 'scanner-1',
      _batchId: '1234-1',
      _batchLabel: 'Batch 1',
      'governor-contest-constitution': ['write-in-0'],
      'mayor-contest-constitution': ['write-in-0'],
      'chief-pokemon-constitution': ['flareon', 'umbreon', 'vaporeon'],
      'schoolboard-constitution': ['aras-baskauskas', 'yul-kwon', 'earl-cole'],
    },
    {
      _ballotId: unsafeParse(BallotIdSchema, 'id-188'),
      _ballotType: 'absentee',
      _precinctId: 'precinct-1',
      _ballotStyleId: '3C',
      _testBallot: true,
      _scannerId: 'scanner-2',
      _batchId: '1234-3',
      _batchLabel: 'Batch 1',
      'governor-contest-constitution': ['write-in-0'],
      'mayor-contest-constitution': ['write-in-0'],
      'chief-pokemon-constitution': ['flareon', 'umbreon', 'vaporeon'],
      'schoolboard-constitution': ['aras-baskauskas', 'yul-kwon', 'earl-cole'],
    },
  ];

  renderInAppContext(
    <WriteInsTranscriptionScreen
      election={electionDefinition.election}
      contest={contest}
      ballotIdxBeingAdjudicated={0}
      ballotsBeingAdjudicated={ballotsBeingAdjudicated}
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
  screen.getByText('Mickey Mouse').click();
  expect(saveTranscribedValue).toHaveBeenCalledWith(
    'id-174',
    'best-animal-mammal',
    'Mickey Mouse'
  );

  screen.getByText('List All').click();
  expect(onListAll).toHaveBeenCalledTimes(1);

  screen.getByText('Previous').click();
  expect(onClickPrevious).toHaveBeenCalledTimes(1);

  screen.getByText('Next').click();
  expect(onClickNext).toHaveBeenCalledTimes(1);

  screen.getByText('Exit').click();
  expect(onClose).toHaveBeenCalledTimes(1);
});
