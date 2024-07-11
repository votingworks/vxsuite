import { electionTwoPartyPrimaryDefinition as electionDefinition } from '@votingworks/fixtures';
import { ContestId } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import {
  WriteInCandidateRecord,
  WriteInImageView,
} from '@votingworks/admin-backend';
import { Route } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '../../test/react_testing_library';
import {
  RenderInAppContextParams,
  renderInAppContext,
} from '../../test/render_in_app_context';
import { WriteInsAdjudicationScreen } from './write_ins_adjudication_screen';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

const mockPartialWriteInIdentifier = {
  contestId: 'contest-id',
  optionId: 'write-in-0',
  cvrId: 'cast-vote-record-id',
  electionId: 'election-id',
} as const;

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen(
  contestId: ContestId,
  appContextParams: RenderInAppContextParams = {}
) {
  return renderInAppContext(
    <Route path="/write-ins/adjudication/:contestId">
      <WriteInsAdjudicationScreen />
    </Route>,
    {
      route: `/write-ins/adjudication/${contestId}`,
      ...appContextParams,
    }
  );
}

function expectGetQueueMetadata({
  total,
  pending,
  contestId,
}: {
  total: number;
  pending: number;
  contestId: ContestId;
}): void {
  apiMock.expectGetWriteInAdjudicationQueueMetadata(
    [
      {
        totalTally: total,
        pendingTally: pending,
        contestId,
      },
    ],
    contestId
  );
}

test('hmp ballot is a zoomable ballot image', async () => {
  const contestId = 'best-animal-mammal';
  function mockWriteInImage(id: string): Partial<WriteInImageView> {
    return {
      imageUrl: `mock-image-data-${id}`,
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

  apiMock.expectGetWriteInAdjudicationQueue(['id-174', 'id-175'], contestId);
  apiMock.expectGetFirstPendingWriteInId(contestId, 'id-174');
  expectGetQueueMetadata({ total: 2, pending: 2, contestId });
  apiMock.expectGetWriteInCandidates([], contestId);
  apiMock.expectGetWriteInImageView('id-174', mockWriteInImage('174'));
  apiMock.expectGetWriteInAdjudicationContext('id-174');
  apiMock.expectGetWriteInImageView('id-175', mockWriteInImage('175'));
  apiMock.expectGetWriteInAdjudicationContext('id-175');

  renderScreen(contestId, {
    electionDefinition,
    apiMock,
  });

  await screen.findByTestId('transcribe:id-174');
  let ballotImage = await screen.findByRole('img', {
    name: /ballot with write-in/i,
  });
  expect(ballotImage).toHaveAttribute('src', 'mock-image-data-174');

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
  ballotImage = screen.getByRole('img', {
    name: /full ballot/i,
  });
  expect(ballotImage).toHaveStyle({ width: '100%' });
  expect(zoomInButton).toBeEnabled();
  expect(zoomOutButton).toBeDisabled();

  // Zoom back in
  userEvent.click(zoomInButton);
  ballotImage = screen.getByRole('img', {
    name: /ballot with write-in/i,
  });
  expect(ballotImage).toHaveStyle({ width: `${expectedZoomedInWidth}px` });

  // Zoom back out
  userEvent.click(zoomOutButton);
  ballotImage = screen.getByRole('img', {
    name: /full ballot/i,
  });
  expect(ballotImage).toHaveStyle({ width: '100%' });

  // When switching to next adjudication, resets to zoomed in
  userEvent.click(screen.getButton(/Next/));
  await screen.findByTestId('transcribe:id-175');

  ballotImage = await screen.findByRole('img', {
    name: /ballot with write-in/i,
  });
  expect(ballotImage).toHaveAttribute('src', 'mock-image-data-175');
  expect(ballotImage).toHaveStyle({ width: `${expectedZoomedInWidth}px` });
  zoomInButton = screen.getButton(/Zoom In/);
  zoomOutButton = screen.getButton(/Zoom Out/);
  expect(zoomInButton).toBeDisabled();
  expect(zoomOutButton).toBeEnabled();

  // Zoom out
  userEvent.click(zoomOutButton);
  ballotImage = screen.getByRole('img', {
    name: /full ballot/i,
  });
  expect(ballotImage).toHaveStyle({ width: '100%' });

  // When switching to previous adjudication, resets to zoomed in
  userEvent.click(screen.getButton(/Previous/));
  await screen.findByTestId('transcribe:id-174');
  ballotImage = await screen.findByRole('img', {
    name: /ballot with write-in/i,
  });
  expect(ballotImage).toHaveStyle({ width: `${expectedZoomedInWidth}px` });
});

test('bmd ballot is not a zoomable ballot image', async () => {
  const contestId = 'best-animal-mammal';
  function mockWriteInImage(id: string): Partial<WriteInImageView> {
    return {
      imageUrl: `mock-image-data-${id}`,
      machineMarkedText: `MOCK NAME ${id}`,
    };
  }

  apiMock.expectGetWriteInAdjudicationQueue(['id-174', 'id-175'], contestId);
  apiMock.expectGetFirstPendingWriteInId(contestId, 'id-174');
  expectGetQueueMetadata({ total: 2, pending: 2, contestId });
  apiMock.expectGetWriteInCandidates([], contestId);
  apiMock.expectGetWriteInImageView('id-174', mockWriteInImage('174'));
  apiMock.expectGetWriteInAdjudicationContext('id-174');
  apiMock.expectGetWriteInImageView('id-175', mockWriteInImage('175'));
  apiMock.expectGetWriteInAdjudicationContext('id-175');

  renderScreen(contestId, {
    electionDefinition,
    apiMock,
  });

  await screen.findByTestId('transcribe:id-174');
  let ballotImage = await screen.findByRole('img', {
    name: /Full ballot/i,
  });
  expect(ballotImage).toHaveAttribute('src', 'mock-image-data-174');

  // Fully zoomed out
  expect(ballotImage).toHaveStyle({ width: `100%` });

  // There should be no zoom buttons
  // Check that there is not a button with the text "Zoom In" on it in the screen

  expect(screen.queryByText(/Zoom In/)).toBeNull();
  expect(screen.queryByText(/Zoom Out/)).toBeNull();

  // We should show the machine marked text on screen
  screen.getByText(/Write-In Text:/);
  screen.getByText(/MOCK NAME 174/);
  userEvent.click(screen.getButton('Add new write-in candidate'));
  const inputA = await screen.findByTestId('write-in-candidate-name-input');
  expect(inputA).toHaveValue('MOCK NAME 174');

  // When switching to next adjudication, text changes
  userEvent.click(screen.getButton(/Next/));
  await screen.findByTestId('transcribe:id-175');

  ballotImage = await screen.findByRole('img', {
    name: /Full ballot/i,
  });
  expect(ballotImage).toHaveAttribute('src', 'mock-image-data-175');
  expect(ballotImage).toHaveStyle({ width: `100%` });
  screen.getByText(/Write-In Text:/);
  screen.getByText(/MOCK NAME 175/);

  userEvent.click(screen.getButton('Add new write-in candidate'));
  const inputB = await screen.findByTestId('write-in-candidate-name-input');
  expect(inputB).toHaveValue('MOCK NAME 175');
});

describe('preventing double votes', () => {
  const contestId = 'best-animal-mammal';
  const writeInId = 'id';

  test('previous bubble marked official candidates', async () => {
    apiMock.expectGetWriteInAdjudicationQueue([writeInId], contestId);
    apiMock.expectGetFirstPendingWriteInId(contestId, 'id');
    expectGetQueueMetadata({ total: 1, pending: 1, contestId });
    apiMock.expectGetWriteInCandidates([], contestId);
    apiMock.expectGetWriteInImageView(writeInId);
    apiMock.expectGetWriteInAdjudicationContext(writeInId, {
      cvrVotes: { [contestId]: ['fox'] },
    });

    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await screen.findByRole('img', {
      name: /ballot with write-in/i,
    });

    userEvent.click(screen.getButton('Fox'));
    await screen.findByText('Possible Double Vote Detected');
    screen.getByText(/has a bubble selection marked for/);
  });

  test('previous adjudicated official candidates', async () => {
    apiMock.expectGetWriteInAdjudicationQueue([writeInId], contestId);
    apiMock.expectGetFirstPendingWriteInId(contestId, 'id');
    expectGetQueueMetadata({ total: 1, pending: 1, contestId });
    apiMock.expectGetWriteInCandidates([], contestId);
    apiMock.expectGetWriteInImageView(writeInId);
    apiMock.expectGetWriteInAdjudicationContext('id', {
      relatedWriteIns: [
        {
          ...mockPartialWriteInIdentifier,
          id: 'id',
          status: 'adjudicated',
          adjudicationType: 'official-candidate',
          contestId,
          candidateId: 'fox',
          optionId: 'write-in-0',
        },
      ],
    });

    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await screen.findByRole('img', {
      name: /ballot with write-in/i,
    });

    userEvent.click(screen.getButton('Fox'));
    await screen.findByText('Possible Double Vote Detected');
    screen.getByText(/has a write-in that has already been adjudicated for/);
  });

  test('previous adjudicated write-in candidates', async () => {
    const mockWriteInCandidate: WriteInCandidateRecord = {
      id: 'puma',
      electionId: 'id',
      contestId,
      name: 'Puma',
    };

    apiMock.expectGetWriteInCandidates([mockWriteInCandidate], contestId);
    apiMock.expectGetWriteInAdjudicationQueue([writeInId], contestId);
    apiMock.expectGetFirstPendingWriteInId(contestId, 'id');
    expectGetQueueMetadata({ total: 1, pending: 1, contestId });
    apiMock.expectGetWriteInImageView(writeInId);
    apiMock.expectGetWriteInAdjudicationContext('id', {
      relatedWriteIns: [
        {
          ...mockPartialWriteInIdentifier,
          id: 'id',
          status: 'adjudicated',
          adjudicationType: 'write-in-candidate',
          contestId,
          candidateId: mockWriteInCandidate.id,
          optionId: 'write-in-0',
        },
      ],
    });

    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await screen.findByRole('img', {
      name: /ballot with write-in/i,
    });

    userEvent.click(screen.getButton('Puma'));
    await screen.findByText('Possible Double Vote Detected');
    screen.getByText(/has a write-in that has already been adjudicated for/);
  });
});

test('close button', async () => {
  const contestId = 'best-animal-mammal';
  const writeInId = 'id';

  apiMock.expectGetWriteInAdjudicationQueue([writeInId], contestId);
  apiMock.expectGetFirstPendingWriteInId(contestId, 'id');
  expectGetQueueMetadata({ total: 1, pending: 1, contestId });
  apiMock.expectGetWriteInCandidates([], contestId);
  apiMock.expectGetWriteInImageView(writeInId);
  apiMock.expectGetWriteInAdjudicationContext(writeInId);

  const history = createMemoryHistory();
  history.push(`/write-ins/adjudication/${contestId}`);
  renderScreen(contestId, {
    electionDefinition,
    apiMock,
    history,
  });

  await screen.findByRole('heading', { name: 'Adjudicate Write-In' });
  userEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(history.location.pathname).toEqual('/write-ins'));
});

test('ballot pagination', async () => {
  const contestId = 'zoo-council-mammal';
  const writeInIds = ['0', '1', '2'];
  const pageCount = writeInIds.length;

  apiMock.expectGetWriteInAdjudicationQueue(writeInIds, contestId);
  apiMock.expectGetFirstPendingWriteInId(contestId, '0');
  expectGetQueueMetadata({ total: 3, pending: 3, contestId });
  apiMock.expectGetWriteInCandidates([], contestId);
  for (const writeInId of writeInIds) {
    apiMock.expectGetWriteInImageView(writeInId);
    apiMock.expectGetWriteInAdjudicationContext(writeInId);
  }

  const history = createMemoryHistory();
  history.push(`/write-ins/adjudication/${contestId}`);
  renderScreen(contestId, {
    electionDefinition,
    apiMock,
    history,
  });

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    await screen.findByText(new RegExp(`${pageNumber} of ${pageCount}`));
    const previousButton = await screen.findButton('Previous');
    if (pageNumber === 1) {
      expect(previousButton).toBeDisabled();
    } else {
      expect(previousButton).not.toBeDisabled();
    }

    if (pageNumber === pageCount) {
      const finishButton = await screen.findButton('Finish');
      userEvent.click(finishButton);
      expect(history.location.pathname).toEqual('/write-ins');
    } else {
      const nextButton = await screen.findButton('Next');
      expect(nextButton).not.toBeDisabled();
      userEvent.click(nextButton);
    }
  }
});

describe('making adjudications', () => {
  const contestId = 'zoo-council-mammal';
  const writeInId = '0';
  const mockWriteInCandidate: WriteInCandidateRecord = {
    id: 'lemur',
    name: 'Lemur',
    contestId: 'zoo-council-mammal',
    electionId: 'id',
  };

  beforeEach(async () => {
    apiMock.expectGetWriteInAdjudicationQueue([writeInId], contestId);
    apiMock.expectGetFirstPendingWriteInId(contestId, '0');
    apiMock.expectGetWriteInCandidates([mockWriteInCandidate], contestId);
    apiMock.expectGetWriteInImageView(writeInId);
    apiMock.expectGetWriteInAdjudicationContext(writeInId);
    expectGetQueueMetadata({ total: 2, pending: 2, contestId });

    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await screen.findByRole('img', { name: /ballot/i });
  });

  test('official candidate', async () => {
    screen.getButton('Zebra');
    screen.getButton('Lion');
    screen.getButton('Kangaroo');
    screen.getButton('Elephant');

    apiMock.apiClient.adjudicateWriteIn
      .expectCallWith({
        writeInId,
        type: 'official-candidate',
        candidateId: 'zebra',
      })
      .resolves();
    apiMock.expectGetWriteInAdjudicationContext(writeInId, {
      writeIn: {
        id: writeInId,
        ...mockPartialWriteInIdentifier,
        status: 'adjudicated',
        adjudicationType: 'official-candidate',
        candidateId: 'zebra',
      },
    });
    apiMock.expectGetWriteInCandidates([], contestId);
    expectGetQueueMetadata({ total: 2, pending: 1, contestId });

    userEvent.click(screen.getButton('Zebra'));
    await waitFor(async () =>
      expect(await screen.findButton('Next')).toHaveFocus()
    );

    // clicking current selection should deselect it
    apiMock.apiClient.adjudicateWriteIn
      .expectCallWith({
        writeInId,
        type: 'reset',
      })
      .resolves();
    apiMock.expectGetWriteInAdjudicationContext(writeInId, {
      writeIn: {
        id: writeInId,
        ...mockPartialWriteInIdentifier,
        status: 'pending',
      },
    });
    apiMock.expectGetWriteInCandidates([], contestId);
    expectGetQueueMetadata({ total: 2, pending: 2, contestId });

    userEvent.click(screen.getButton('Zebra'));
  });

  test('existing write-in candidate', async () => {
    screen.getButton('Lemur');

    apiMock.apiClient.adjudicateWriteIn
      .expectCallWith({
        writeInId,
        type: 'write-in-candidate',
        candidateId: 'lemur',
      })
      .resolves();
    apiMock.expectGetWriteInAdjudicationContext(writeInId, {
      writeIn: {
        id: writeInId,
        ...mockPartialWriteInIdentifier,
        status: 'adjudicated',
        adjudicationType: 'write-in-candidate',
        candidateId: 'lemur',
      },
    });
    apiMock.expectGetWriteInCandidates([mockWriteInCandidate], contestId);
    expectGetQueueMetadata({ total: 2, pending: 1, contestId });

    userEvent.click(screen.getButton('Lemur'));
    await waitFor(async () =>
      expect(await screen.findButton('Next')).toHaveFocus()
    );

    // clicking current selection should deselect it
    apiMock.apiClient.adjudicateWriteIn
      .expectCallWith({
        writeInId,
        type: 'reset',
      })
      .resolves();
    apiMock.expectGetWriteInAdjudicationContext(writeInId, {
      writeIn: {
        id: writeInId,
        ...mockPartialWriteInIdentifier,
        status: 'pending',
      },
    });
    apiMock.expectGetWriteInCandidates([], contestId);
    expectGetQueueMetadata({ total: 2, pending: 2, contestId });

    userEvent.click(screen.getButton('Lemur'));
  });

  test('new write-in candidate', async () => {
    const mockNewWriteInCandidateRecord: WriteInCandidateRecord = {
      id: 'fox',
      contestId,
      electionId: 'any',
      name: 'Fox',
    };

    screen.getButton('Add new write-in candidate');

    apiMock.apiClient.addWriteInCandidate
      .expectCallWith({ contestId, name: 'Fox' })
      .resolves(mockNewWriteInCandidateRecord);
    apiMock.expectGetWriteInCandidates(
      [mockWriteInCandidate, mockNewWriteInCandidateRecord],
      contestId
    );
    apiMock.apiClient.adjudicateWriteIn
      .expectCallWith({
        writeInId,
        type: 'write-in-candidate',
        candidateId: 'fox',
      })
      .resolves();
    apiMock.expectGetWriteInCandidates(
      [mockWriteInCandidate, mockNewWriteInCandidateRecord],
      contestId
    );
    apiMock.expectGetWriteInAdjudicationContext(writeInId, {
      writeIn: {
        id: writeInId,
        ...mockPartialWriteInIdentifier,
        status: 'adjudicated',
        adjudicationType: 'write-in-candidate',
        candidateId: 'fox',
      },
    });
    expectGetQueueMetadata({ total: 2, pending: 1, contestId });
    userEvent.click(screen.getButton('Add new write-in candidate'));
    userEvent.type(await screen.findByPlaceholderText('Candidate Name'), 'Fox');
    userEvent.click(await screen.findByText('Add'));

    await screen.findButton('Fox');
    await waitFor(async () =>
      expect(await screen.findButton('Next')).toHaveFocus()
    );
  });

  test('marking invalid', async () => {
    apiMock.apiClient.adjudicateWriteIn
      .expectCallWith({
        writeInId,
        type: 'invalid',
      })
      .resolves();
    apiMock.expectGetWriteInAdjudicationContext(writeInId, {
      writeIn: {
        id: writeInId,
        ...mockPartialWriteInIdentifier,
        status: 'adjudicated',
        adjudicationType: 'invalid',
      },
    });
    apiMock.expectGetWriteInCandidates([mockWriteInCandidate], contestId);
    expectGetQueueMetadata({ total: 2, pending: 1, contestId });

    userEvent.click(screen.getButton('Mark write-in invalid'));
    await waitFor(async () =>
      expect(await screen.findButton('Next')).toHaveFocus()
    );

    // clicking current selection should deselect it
    apiMock.apiClient.adjudicateWriteIn
      .expectCallWith({
        writeInId,
        type: 'reset',
      })
      .resolves();
    apiMock.expectGetWriteInAdjudicationContext(writeInId, {
      writeIn: {
        id: writeInId,
        ...mockPartialWriteInIdentifier,
        status: 'pending',
      },
    });
    apiMock.expectGetWriteInCandidates([mockWriteInCandidate], contestId);
    expectGetQueueMetadata({ total: 2, pending: 2, contestId });

    userEvent.click(screen.getButton('Mark write-in invalid'));
  });
});

test('new write-in candidate form, keyboard input', async () => {
  const contestId = 'zoo-council-mammal';
  const writeInId = '0';

  apiMock.expectGetWriteInAdjudicationQueue([writeInId], contestId);
  apiMock.expectGetFirstPendingWriteInId(contestId, '0');
  apiMock.expectGetWriteInCandidates([], contestId);
  apiMock.expectGetWriteInImageView(writeInId);
  apiMock.expectGetWriteInAdjudicationContext(writeInId);
  expectGetQueueMetadata({ total: 1, pending: 1, contestId });

  renderScreen(contestId, {
    electionDefinition,
    apiMock,
  });

  await screen.findByRole('img', { name: /ballot/i });

  userEvent.click(screen.getButton('Add new write-in candidate'));
  const addButton = await screen.findButton('Add');
  const nameInput = await screen.findByPlaceholderText('Candidate Name');

  // should be disabled when empty, pressing enter should be no-op
  expect(addButton).toBeDisabled();
  userEvent.keyboard('{enter}');
  expect(addButton).toBeInTheDocument();

  // should be disabled when name taken, pressing enter should be no-op
  userEvent.type(nameInput, 'Zebra');
  expect(addButton).toBeDisabled();
  userEvent.keyboard('{enter}');
  expect(addButton).toBeInTheDocument();

  // should be enabled with a new name
  userEvent.keyboard('{backspace>5}');
  userEvent.keyboard('Lemur');
  expect(addButton).not.toBeDisabled();

  // confirm add with {enter}
  const mockNewWriteInCandidateRecord: WriteInCandidateRecord = {
    id: 'lemur',
    contestId,
    electionId: 'id',
    name: 'Lemur',
  };
  apiMock.apiClient.addWriteInCandidate
    .expectCallWith({ contestId, name: 'Lemur' })
    .resolves(mockNewWriteInCandidateRecord);
  apiMock.expectGetWriteInCandidates(
    [mockNewWriteInCandidateRecord],
    contestId
  );
  apiMock.apiClient.adjudicateWriteIn
    .expectCallWith({
      writeInId,
      type: 'write-in-candidate',
      candidateId: 'lemur',
    })
    .resolves();
  apiMock.expectGetWriteInCandidates(
    [mockNewWriteInCandidateRecord],
    contestId
  );
  apiMock.expectGetWriteInAdjudicationContext(writeInId, {
    writeIn: {
      id: writeInId,
      ...mockPartialWriteInIdentifier,
      status: 'adjudicated',
      adjudicationType: 'write-in-candidate',
      candidateId: 'lemur',
    },
  });
  expectGetQueueMetadata({ total: 1, pending: 0, contestId });
  userEvent.keyboard('{enter}');
  await screen.findByText('Add new write-in candidate');
});

test('jumping to first pending write-in', async () => {
  const contestId = 'zoo-council-mammal';
  const writeInIds = ['win0', 'win1', 'win2'];

  apiMock.expectGetWriteInAdjudicationQueue(writeInIds, contestId);
  apiMock.expectGetFirstPendingWriteInId(contestId, 'win1');
  expectGetQueueMetadata({ total: 3, pending: 2, contestId });
  apiMock.expectGetWriteInCandidates([], contestId);
  // expect fetch for all three images - current, next, previous
  apiMock.expectGetWriteInImageView('win1');
  apiMock.expectGetWriteInImageView('win2');
  apiMock.expectGetWriteInImageView('win0');
  apiMock.expectGetWriteInAdjudicationContext('win1');

  renderScreen(contestId, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('win1');
});
