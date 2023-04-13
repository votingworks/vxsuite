import React from 'react';
import { electionMinimalExhaustiveSampleDefinition as electionDefinition } from '@votingworks/fixtures';
import { CandidateContest, safeParseNumber } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { screen } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInsTranscriptionScreen } from './write_ins_transcription_screen';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';

const contest = electionDefinition.election.contests[0] as CandidateContest;
const onClose = jest.fn();
const saveTranscribedValue = jest.fn();

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('clicking a previously-saved value', async () => {
  apiMock.expectGetWriteInImage('id-174');
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
    { electionDefinition, apiMock }
  );

  // Click a previously-saved transcription
  userEvent.click(await screen.findByText('Mickey Mouse'));
  expect(saveTranscribedValue).toHaveBeenCalledWith('id-174', 'Mickey Mouse');

  await screen.findByTestId('transcribe:id-174');
  apiMock.expectGetWriteInImage('id-175');
  userEvent.click(await screen.findByText('Next'));
  await screen.findByTestId('transcribe:id-175');
  userEvent.click(await screen.findByText('Previous'));
  await screen.findByTestId('transcribe:id-174');

  userEvent.click(await screen.findByText('Back to All Write-Ins'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('zoomable ballot image', async () => {
  function fakeWriteInImage(id: string) {
    return {
      image: `fake-image-data-${id}`,
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
  apiMock.apiClient.getWriteInImage
    .expectCallWith({ writeInId: 'id-174' })
    .resolves([fakeWriteInImage('174')]);
  apiMock.apiClient.getWriteInImage
    .expectCallWith({ writeInId: 'id-175' })
    .resolves([fakeWriteInImage('175')]);

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
          transcribedValue: '',
          id: 'id-175',
        },
      ]}
      onClose={onClose}
      saveTranscribedValue={saveTranscribedValue}
    />,
    { electionDefinition, apiMock }
  );

  await screen.findByTestId('transcribe:id-174');
  let ballotImage = await screen.findByRole('img');
  expect(ballotImage).toHaveAttribute(
    'src',
    'data:image/png;base64,fake-image-data-174'
  );

  function getWidth(element: HTMLElement) {
    return safeParseNumber(element.getAttribute('width')!).assertOk(
      'Width should be number'
    );
  }

  // Initially zoomed in to show the write-in area
  const expectedZoomedInWidth =
    100 * // Starting ballot image width
    (100 / 60) * // Scaled based on write-in area size
    0.5; // Scaled based on exported image resizing
  expect(getWidth(ballotImage).toPrecision(5)).toEqual(
    expectedZoomedInWidth.toPrecision(5)
  );
  let zoomInButton = screen.getButton(/Zoom In/);
  let zoomOutButton = screen.getButton(/Zoom Out/);
  expect(zoomInButton).toBeDisabled();
  expect(zoomOutButton).toBeEnabled();

  // Zoom out to show the entire ballot
  userEvent.click(zoomOutButton);
  const expectedZoomedOutWidth = 100 * 0.5; // Scaled to show the entire ballot
  expect(getWidth(ballotImage).toPrecision(5)).toEqual(
    expectedZoomedOutWidth.toPrecision(5)
  );
  expect(zoomInButton).toBeEnabled();
  expect(zoomOutButton).toBeDisabled();

  // Zoom back in
  userEvent.click(zoomInButton);
  expect(getWidth(ballotImage).toPrecision(5)).toEqual(
    expectedZoomedInWidth.toPrecision(5)
  );

  // When switching to next transcription, the zoom level is reset
  userEvent.click(zoomOutButton);
  expect(zoomOutButton).toBeDisabled();
  userEvent.click(screen.getButton(/Next/));
  await screen.findByTestId('transcribe:id-175');

  ballotImage = screen.getByRole('img');
  expect(ballotImage).toHaveAttribute(
    'src',
    'data:image/png;base64,fake-image-data-175'
  );
  expect(getWidth(ballotImage).toPrecision(5)).toEqual(
    expectedZoomedInWidth.toPrecision(5)
  );
  zoomInButton = screen.getButton(/Zoom In/);
  zoomOutButton = screen.getButton(/Zoom Out/);
  expect(zoomInButton).toBeDisabled();
  expect(zoomOutButton).toBeEnabled();
});
