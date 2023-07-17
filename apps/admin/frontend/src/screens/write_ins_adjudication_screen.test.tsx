import { electionMinimalExhaustiveSampleDefinition as electionDefinition } from '@votingworks/fixtures';
import { CandidateContest, ContestId } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import {
  WriteInCandidateRecord,
  WriteInDetailView,
  WriteInRecord,
  WriteInRecordPending,
} from '@votingworks/admin-backend';
import { Route } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '../../test/react_testing_library';
import {
  RenderInAppContextParams,
  renderInAppContext,
} from '../../test/render_in_app_context';
import { WriteInsAdjudicationScreen } from './write_ins_adjudication_screen';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';

const contest = electionDefinition.election.contests[0] as CandidateContest;

function mockWriteInRecordPending(id: string): WriteInRecordPending {
  return {
    id,
    contestId: 'zoo-council-mammal',
    optionId: 'write-in-0',
    castVoteRecordId: 'id',
    status: 'pending',
  };
}

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

test('zoomable ballot image', async () => {
  function fakeWriteInImage(id: string): Partial<WriteInDetailView> {
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
  apiMock.expectGetWriteInDetailView('id-174', fakeWriteInImage('174'));
  apiMock.expectGetWriteInDetailView('id-175', fakeWriteInImage('175'));
  apiMock.expectGetWriteIns(
    [
      {
        id: 'id-174',
        status: 'pending',
        contestId: contest.id,
        optionId: 'write-in-0',
        castVoteRecordId: 'id-174',
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

  renderScreen(contest.id, {
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
  const mockWriteInRecord: WriteInRecord = {
    id: 'id',
    status: 'pending',
    contestId: contest.id,
    optionId: 'write-in-0',
    castVoteRecordId: 'id',
  };

  test('previous bubble marked official candidates', async () => {
    apiMock.expectGetWriteIns([mockWriteInRecord], contest.id);
    apiMock.expectGetWriteInDetailView('id', {
      markedOfficialCandidateIds: ['fox'],
    });
    apiMock.expectGetWriteInCandidates([], contest.id);

    renderScreen(contest.id, {
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
    apiMock.expectGetWriteIns([mockWriteInRecord], contest.id);
    apiMock.expectGetWriteInDetailView('id', {
      writeInAdjudicatedOfficialCandidateIds: ['fox'],
    });
    apiMock.expectGetWriteInCandidates([], contest.id);

    renderScreen(contest.id, {
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
      contestId: contest.id,
      name: 'Puma',
    };
    apiMock.expectGetWriteIns([mockWriteInRecord], contest.id);
    apiMock.expectGetWriteInDetailView('id', {
      writeInAdjudicatedWriteInCandidateIds: ['puma'],
    });
    apiMock.expectGetWriteInCandidates([mockWriteInCandidate], contest.id);

    renderScreen(contest.id, {
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

test('ballot pagination', async () => {
  const contestId = 'zoo-council-mammal';
  const mockWriteInRecords = ['0', '1', '2'].map(mockWriteInRecordPending);
  const pageCount = mockWriteInRecords.length;
  apiMock.expectGetWriteIns(mockWriteInRecords, contestId);
  apiMock.expectGetWriteInCandidates([], contestId);
  for (const mockWriteInRecord of mockWriteInRecords) {
    apiMock.expectGetWriteInDetailView(mockWriteInRecord.id);
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
      doneButton.click();
      expect(history.location.pathname).toEqual('/write-ins');
    } else {
      expect(nextButton).not.toBeDisabled();
      nextButton.click();
    }
  }
});

test('adjudication flow', async () => {
  const contestId = 'zoo-council-mammal';
  const mockWriteInRecords = ['0', '1'].map(mockWriteInRecordPending);
  apiMock.expectGetWriteIns(mockWriteInRecords, contestId);
  const mockWriteInCandidate: WriteInCandidateRecord = {
    id: 'lemur',
    name: 'Lemur',
    contestId: 'zoo-council-mammal',
    electionId: 'id',
  };
  apiMock.expectGetWriteInCandidates([mockWriteInCandidate], contestId);
  apiMock.expectGetWriteInDetailView(mockWriteInRecords[0].id);
  apiMock.expectGetWriteInDetailView(mockWriteInRecords[1].id); // prefetch
  renderScreen(contestId, {
    electionDefinition,
    apiMock,
  });

  await screen.findByRole('img', { name: /ballot/i });
  screen.getButton('Zebra');
  screen.getButton('Lion');
  screen.getButton('Kangaroo');
  screen.getButton('Elephant');
  screen.getButton('Lemur');

  // adjudicate for official candidate
  const partialMockAdjudicatedWriteIn = {
    id: '0',
    contestId: 'zoo-council-mammal',
    optionId: 'write-in-0',
    castVoteRecordId: 'id',
    status: 'adjudicated',
  } as const;
  apiMock.apiClient.adjudicateWriteIn
    .expectCallWith({
      writeInId: mockWriteInRecords[0].id,
      type: 'official-candidate',
      candidateId: 'zebra',
    })
    .resolves();
  apiMock.expectGetWriteIns(
    [
      {
        ...partialMockAdjudicatedWriteIn,
        adjudicationType: 'official-candidate',
        candidateId: 'zebra',
      },
      mockWriteInRecords[1],
    ],
    contestId
  );
  apiMock.expectGetWriteInCandidates([mockWriteInCandidate], contestId);
  apiMock.expectGetWriteInDetailView(mockWriteInRecords[1].id);

  userEvent.click(screen.getButton('Zebra'));
  await waitFor(async () =>
    expect(await screen.findButton('Next')).toHaveFocus()
  );

  // clicking current selection should be no-op
  userEvent.click(screen.getButton('Zebra'));
  apiMock.assertComplete();

  // adjudicate for existing write-in candidate
  apiMock.apiClient.adjudicateWriteIn
    .expectCallWith({
      writeInId: mockWriteInRecords[0].id,
      type: 'write-in-candidate',
      candidateId: 'lemur',
    })
    .resolves();
  apiMock.expectGetWriteIns(
    [
      {
        ...partialMockAdjudicatedWriteIn,
        adjudicationType: 'write-in-candidate',
        candidateId: 'lemur',
      },
      mockWriteInRecords[1],
    ],
    contestId
  );
  apiMock.expectGetWriteInCandidates([mockWriteInCandidate], contestId);
  apiMock.expectGetWriteInDetailView(mockWriteInRecords[1].id);
  userEvent.click(screen.getButton('Lemur'));
  await waitFor(async () =>
    expect(await screen.findButton('Next')).toHaveFocus()
  );

  // clicking current selection should be no-op
  userEvent.click(screen.getButton('Lemur'));
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
      writeInId: mockWriteInRecords[0].id,
      type: 'write-in-candidate',
      candidateId: 'dh',
    })
    .resolves();
  apiMock.expectGetWriteIns(
    [
      {
        ...partialMockAdjudicatedWriteIn,
        adjudicationType: 'official-candidate',
        candidateId: 'dh',
      },
      mockWriteInRecords[1],
    ],
    contestId
  );
  apiMock.expectGetWriteInCandidates(
    [mockWriteInCandidate, mockNewWriteInCandidateRecord],
    contestId
  );
  apiMock.expectGetWriteInCandidates(
    [mockWriteInCandidate, mockNewWriteInCandidateRecord],
    contestId
  );
  apiMock.expectGetWriteInDetailView(mockWriteInRecords[1].id);
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
      writeInId: mockWriteInRecords[0].id,
      type: 'invalid',
    })
    .resolves();
  apiMock.expectGetWriteIns(
    [
      {
        ...partialMockAdjudicatedWriteIn,
        adjudicationType: 'invalid',
      },
      mockWriteInRecords[1],
    ],
    contestId
  );
  apiMock.expectGetWriteInCandidates([mockWriteInCandidate], contestId);
  apiMock.expectGetWriteInDetailView(mockWriteInRecords[1].id);
  userEvent.click(await screen.findButton(/Mark Write-In Invalid/i));
  await waitFor(async () =>
    expect(await screen.findButton('Next')).toHaveFocus()
  );
  expect(screen.queryByText('Dark Helmet')).not.toBeInTheDocument();
});
