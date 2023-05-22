import userEvent from '@testing-library/user-event';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { sleep } from '@votingworks/basics';
import React from 'react';
import type {
  WriteInCandidateRecord,
  WriteInRecordPending,
  WriteInSummaryEntryPending,
} from '@votingworks/admin-backend';
import { act, screen, waitFor } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInsScreen } from './write_ins_screen';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';

jest.setTimeout(20000);

const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;

function mockWriteInRecordPending(id: string): WriteInRecordPending {
  return {
    id,
    contestId: 'zoo-council-mammal',
    optionId: 'write-in-0',
    castVoteRecordId: 'id',
    status: 'pending',
  };
}

function mockWriteInSummaryPending(
  contestId: string,
  writeInCount: number
): WriteInSummaryEntryPending {
  return {
    status: 'pending',
    contestId,
    writeInCount,
  };
}

let apiMock: ApiMock;

afterEach(async () => {
  apiMock.assertComplete();

  // Several tests on this page create test warnings because hooks run after
  // the end of the test, and there is no specific change on the page to check.
  // TODO: Remove after upgrade to React 18, which does not warn in this case.
  await act(async () => {
    await sleep(1);
  });
});

beforeEach(() => {
  apiMock = createApiMock();
});

test('No CVRs loaded', async () => {
  apiMock.expectGetWriteInSummary([]);
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<WriteInsScreen />, { electionDefinition, apiMock });
  await screen.findByText('Load CVRs to begin adjudicating write-in votes.');
  expect(screen.queryAllByRole('button', { name: /Adjudicate/ })).toHaveLength(
    0
  );
});

test('Tally results already marked as official', async () => {
  apiMock.expectGetWriteInSummary([
    mockWriteInSummaryPending('zoo-council-mammal', 3),
    mockWriteInSummaryPending('aquarium-council-fish', 5),
  ]);
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<WriteInsScreen />, {
    electionDefinition,
    isOfficialResults: true,
    apiMock,
  });

  await screen.findByText(/No further changes may be made/);

  const adjudicateButtons = await screen.findAllButtons(/Adjudicate/);
  for (const adjudicateButton of adjudicateButtons) {
    expect(adjudicateButton).toBeDisabled();
  }
});

test('CVRs with write-ins loaded', async () => {
  apiMock.expectGetWriteInSummary([
    mockWriteInSummaryPending('zoo-council-mammal', 3),
  ]);
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<WriteInsScreen />, {
    electionDefinition,
    apiMock,
  });

  const adjudicateButton = await screen.findButton('Adjudicate 3');
  expect(adjudicateButton).not.toBeDisabled();
});

test('ballot pagination', async () => {
  const contestId = 'zoo-council-mammal';
  const pageCount = 3;
  apiMock.expectGetWriteInSummary([mockWriteInSummaryPending(contestId, 3)]);
  apiMock.expectGetCastVoteRecordFiles([]);

  renderInAppContext(<WriteInsScreen />, {
    electionDefinition,
    apiMock,
  });

  const mockWriteInRecords = ['0', '1', '2'].map(mockWriteInRecordPending);
  apiMock.expectGetWriteIns(mockWriteInRecords, contestId);
  apiMock.expectGetWriteInCandidates([], contestId);
  for (const mockWriteInRecord of mockWriteInRecords) {
    apiMock.expectGetWriteInDetailView(mockWriteInRecord.id);
  }

  userEvent.click(await screen.findByText(`Adjudicate ${pageCount}`));

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
    } else {
      expect(nextButton).not.toBeDisabled();
      nextButton.click();
    }
  }
});

test('adjudication', async () => {
  const contestId = 'zoo-council-mammal';
  apiMock.expectGetWriteInSummary([mockWriteInSummaryPending(contestId, 2)]);
  apiMock.expectGetCastVoteRecordFiles([]);

  renderInAppContext(<WriteInsScreen />, {
    electionDefinition,
    apiMock,
  });

  // open adjudication screen
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
  userEvent.click(await screen.findByText('Adjudicate 2'));

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
  apiMock.expectGetWriteInSummary([]);

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
  apiMock.expectGetWriteInSummary([]);
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
  apiMock.expectGetWriteInSummary([]);
  userEvent.click(await screen.findButton('Add New Write-In Candidate'));
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
  apiMock.expectGetWriteInSummary([]);
  userEvent.click(await screen.findButton('Mark Write-In Invalid'));
  await waitFor(async () =>
    expect(await screen.findButton('Next')).toHaveFocus()
  );
  expect(screen.queryByText('Dark Helmet')).not.toBeInTheDocument();
});
