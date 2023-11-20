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

test('zoomable ballot image', async () => {
  const contestId = 'best-animal-mammal';
  function fakeWriteInImage(id: string): Partial<WriteInImageView> {
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

  apiMock.expectGetWriteInAdjudicationQueue(['id-174', 'id-175'], contestId);
  apiMock.expectGetFirstPendingWriteInId(contestId, 'id-174');
  expectGetQueueMetadata({ total: 2, pending: 2, contestId });
  apiMock.expectGetWriteInCandidates([], contestId);
  apiMock.expectGetWriteInImageView('id-174', fakeWriteInImage('174'));
  apiMock.expectGetWriteInAdjudicationContext('id-174');
  apiMock.expectGetWriteInImageView('id-175', fakeWriteInImage('175'));
  apiMock.expectGetWriteInAdjudicationContext('id-175');

  renderScreen(contestId, {
    electionDefinition,
    apiMock,
  });

  await screen.findByTestId('transcribe:id-174');
  let ballotImage = await screen.findByRole('img', {
    name: /ballot with write-in/i,
  });
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
  expect(ballotImage).toHaveAttribute('src', 'fake-image-data-175');
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

    userEvent.click(screen.getByLabelText('Fox'));
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

    userEvent.click(screen.getByLabelText('Fox'));
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

    userEvent.click(screen.getByLabelText('Puma'));
    await screen.findByText('Possible Double Vote Detected');
    screen.getByText(/has a write-in that has already been adjudicated for/);
  });
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

    const nextButton = await screen.findButton('Next');
    if (pageNumber === pageCount) {
      expect(nextButton).toBeDisabled();
      const doneButton = await screen.findButton('Back to All Write-Ins');
      userEvent.click(doneButton);
      expect(history.location.pathname).toEqual('/write-ins');
    } else {
      expect(nextButton).not.toBeDisabled();
      userEvent.click(nextButton);
    }
  }
});

test('marking adjudications', async () => {
  const contestId = 'zoo-council-mammal';
  const writeInIds = ['0', '1'];
  const mockWriteInCandidate: WriteInCandidateRecord = {
    id: 'lemur',
    name: 'Lemur',
    contestId: 'zoo-council-mammal',
    electionId: 'id',
  };

  apiMock.expectGetWriteInAdjudicationQueue(writeInIds, contestId);
  apiMock.expectGetFirstPendingWriteInId(contestId, '0');
  apiMock.expectGetWriteInCandidates([mockWriteInCandidate], contestId);
  apiMock.expectGetWriteInImageView(writeInIds[0]);
  apiMock.expectGetWriteInImageView(writeInIds[1]); // expected image prefetch
  apiMock.expectGetWriteInAdjudicationContext(writeInIds[0]);
  expectGetQueueMetadata({ total: 2, pending: 2, contestId });

  renderScreen(contestId, {
    electionDefinition,
    apiMock,
  });

  await screen.findByRole('img', { name: /ballot/i });
  screen.getByLabelText('Zebra');
  screen.getByLabelText('Lion');
  screen.getByLabelText('Kangaroo');
  screen.getByLabelText('Elephant');
  screen.getByLabelText('Lemur');

  // adjudicate for official candidate
  apiMock.apiClient.adjudicateWriteIn
    .expectCallWith({
      writeInId: writeInIds[0],
      type: 'official-candidate',
      candidateId: 'zebra',
    })
    .resolves();
  apiMock.expectGetWriteInAdjudicationContext(writeInIds[0], {
    writeIn: {
      id: writeInIds[0],
      ...mockPartialWriteInIdentifier,
      status: 'adjudicated',
      adjudicationType: 'official-candidate',
      candidateId: 'zebra',
    },
  });
  apiMock.expectGetWriteInCandidates([mockWriteInCandidate], contestId);
  expectGetQueueMetadata({ total: 2, pending: 1, contestId });

  userEvent.click(screen.getByLabelText('Zebra'));
  await waitFor(async () =>
    expect(await screen.findButton('Next')).toHaveFocus()
  );

  // clicking current selection should be no-op
  userEvent.click(screen.getByLabelText('Zebra'));
  apiMock.assertComplete();

  // adjudicate for existing write-in candidate
  apiMock.apiClient.adjudicateWriteIn
    .expectCallWith({
      writeInId: writeInIds[0],
      type: 'write-in-candidate',
      candidateId: 'lemur',
    })
    .resolves();
  apiMock.expectGetWriteInAdjudicationContext(writeInIds[0], {
    writeIn: {
      id: writeInIds[0],
      ...mockPartialWriteInIdentifier,
      status: 'adjudicated',
      adjudicationType: 'write-in-candidate',
      candidateId: 'lemur',
    },
  });
  apiMock.expectGetWriteInCandidates([mockWriteInCandidate], contestId);
  expectGetQueueMetadata({ total: 2, pending: 1, contestId });

  userEvent.click(screen.getByLabelText('Lemur'));
  await waitFor(async () =>
    expect(await screen.findButton('Next')).toHaveFocus()
  );

  // clicking current selection should be no-op
  userEvent.click(screen.getByLabelText('Lemur'));
  apiMock.assertComplete();

  // adjudicate for a new write-in-candidate
  const mockNewWriteInCandidateRecord: WriteInCandidateRecord = {
    id: 'dh',
    contestId,
    electionId: 'any',
    name: 'Dark Helmet',
  };
  apiMock.apiClient.addWriteInCandidate
    .expectCallWith({ contestId, name: 'Dark Helmet' })
    .resolves(mockNewWriteInCandidateRecord);
  apiMock.apiClient.adjudicateWriteIn
    .expectCallWith({
      writeInId: writeInIds[0],
      type: 'write-in-candidate',
      candidateId: 'dh',
    })
    .resolves();
  apiMock.expectGetWriteInCandidates(
    [mockWriteInCandidate, mockNewWriteInCandidateRecord],
    contestId
  );
  apiMock.expectGetWriteInCandidates(
    [mockWriteInCandidate, mockNewWriteInCandidateRecord],
    contestId
  );
  apiMock.expectGetWriteInAdjudicationContext(writeInIds[0], {
    writeIn: {
      id: writeInIds[0],
      ...mockPartialWriteInIdentifier,
      status: 'adjudicated',
      adjudicationType: 'write-in-candidate',
      candidateId: 'dh',
    },
  });
  expectGetQueueMetadata({ total: 2, pending: 1, contestId });
  userEvent.click(await screen.findButton(/Add New Write-In Candidate/i));
  userEvent.type(
    await screen.findByPlaceholderText('Candidate Name'),
    'Dark Helmet'
  );
  userEvent.click(await screen.findByText('Add'));

  await screen.findButton('Dark Helmet');
  await waitFor(async () =>
    expect(await screen.findButton('Next')).toHaveFocus()
  );

  // adjudicate as invalid
  apiMock.apiClient.adjudicateWriteIn
    .expectCallWith({
      writeInId: writeInIds[0],
      type: 'invalid',
    })
    .resolves();
  apiMock.expectGetWriteInAdjudicationContext(writeInIds[0], {
    writeIn: {
      id: writeInIds[0],
      ...mockPartialWriteInIdentifier,
      status: 'adjudicated',
      adjudicationType: 'invalid',
    },
  });
  apiMock.expectGetWriteInCandidates([mockWriteInCandidate], contestId);
  expectGetQueueMetadata({ total: 2, pending: 1, contestId });
  userEvent.click(await screen.findButton(/Mark Write-In Invalid/i));
  await waitFor(async () =>
    expect(await screen.findButton('Next')).toHaveFocus()
  );
  expect(screen.queryByText('Dark Helmet')).not.toBeInTheDocument();
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
