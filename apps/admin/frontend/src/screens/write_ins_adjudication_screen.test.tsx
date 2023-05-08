import React from 'react';
import { electionMinimalExhaustiveSampleDefinition as electionDefinition } from '@votingworks/fixtures';
import { CandidateContest } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { screen } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInsAdjudicationScreen } from './write_ins_adjudication_screen';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';

const contest = electionDefinition.election.contests[0] as CandidateContest;
const onClose = jest.fn();

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

// most testing of this screen in `write_ins_screen.test.tsx`

test('zoomable ballot image', async () => {
  function fakeWriteInImage(id: string) {
    return {
      imageUrl: `fake-image-data-${id}`,
      ballotCoordinates: {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
      contestCoordinates: {
        x: 20,
        y: 20,
        width: 60,
        height: 60,
      },
      writeInCoordinates: {
        x: 40,
        y: 20,
        width: 60,
        height: 20,
      },
    };
  }
  apiMock.apiClient.getWriteInImageView
    .expectCallWith({ writeInId: 'id-174' })
    .resolves(fakeWriteInImage('174'));
  apiMock.apiClient.getWriteInImageView
    .expectCallWith({ writeInId: 'id-175' })
    .resolves(fakeWriteInImage('175'));
  apiMock.expectGetWriteIns(
    [
      {
        id: 'id-174',
        status: 'pending',
        contestId: contest.id,
        optionId: 'write-in-0',
        castVoteRecordId: 'id',
      },
      {
        id: 'id-175',
        status: 'pending',
        contestId: contest.id,
        optionId: 'write-in-0',
        castVoteRecordId: 'id',
      },
    ],
    contest.id
  );
  apiMock.expectGetWriteInCandidates([], contest.id);

  renderInAppContext(
    <WriteInsAdjudicationScreen
      election={electionDefinition.election}
      contest={contest}
      onClose={onClose}
    />,
    { electionDefinition, apiMock }
  );

  await screen.findByTestId('transcribe:id-174');
  let ballotImage = await screen.findByRole('img');
  expect(ballotImage).toHaveAttribute('src', 'fake-image-data-174');

  // Initially zoomed in to show the write-in area
  const expectedZoomedInWidth =
    100 * // Starting ballot image width
    (100 / 60) * // Scaled based on write-in area size
    0.5; // Scaled based on exported image resizing
  expect(ballotImage).toHaveStyle({ width: `${expectedZoomedInWidth}px` });
  let zoomInButton = screen.getButton(/Zoom In/);
  let zoomOutButton = screen.getButton(/Zoom Out/);
  expect(zoomInButton).toBeDisabled();
  expect(zoomOutButton).toBeEnabled();

  // Zoom out to show the entire ballot
  userEvent.click(zoomOutButton);
  ballotImage = screen.getByRole('img');
  expect(ballotImage).toHaveStyle({ width: '100%' });
  expect(zoomInButton).toBeEnabled();
  expect(zoomOutButton).toBeDisabled();

  // Zoom back in
  userEvent.click(zoomInButton);
  ballotImage = screen.getByRole('img');
  expect(ballotImage).toHaveStyle({ width: `${expectedZoomedInWidth}px` });

  // Zoom back out
  userEvent.click(zoomOutButton);
  ballotImage = screen.getByRole('img');
  expect(ballotImage).toHaveStyle({ width: '100%' });

  // When switching to next adjudication, resets to zoomed in
  userEvent.click(screen.getButton(/Next/));
  await screen.findByTestId('transcribe:id-175');

  ballotImage = await screen.findByRole('img');
  expect(ballotImage).toHaveAttribute('src', 'fake-image-data-175');
  expect(ballotImage).toHaveStyle({ width: `${expectedZoomedInWidth}px` });
  zoomInButton = screen.getButton(/Zoom In/);
  zoomOutButton = screen.getButton(/Zoom Out/);
  expect(zoomInButton).toBeDisabled();
  expect(zoomOutButton).toBeEnabled();

  // Zoom out
  userEvent.click(zoomOutButton);
  ballotImage = screen.getByRole('img');
  expect(ballotImage).toHaveStyle({ width: '100%' });

  // When switching to previous adjudication, resets to zoomed in
  userEvent.click(screen.getButton(/Previous/));
  await screen.findByTestId('transcribe:id-174');
  ballotImage = await screen.findByRole('img');
  expect(ballotImage).toHaveStyle({ width: `${expectedZoomedInWidth}px` });
});
