import { Scan } from '@votingworks/api';
import fetchMock from 'fetch-mock';
import { fetchNextBallotSheetToReview } from './hmpb';

jest.mock('./config');

test('can fetch the next ballot sheet needing review', async () => {
  const response: Scan.GetNextReviewSheetResponse = {
    id: 'test-sheet',
    front: {
      image: { url: '/' },
      interpretation: { type: 'UnreadablePage' },
    },
    back: {
      image: { url: '/' },
      interpretation: { type: 'UnreadablePage' },
    },
  };
  fetchMock.getOnce('/central-scanner/scan/hmpb/review/next-sheet', {
    status: 200,
    body: response,
  });
  await expect(fetchNextBallotSheetToReview()).resolves.toBeDefined();
});

test('returns undefined if there are no ballot sheets to review', async () => {
  fetchMock.getOnce('/central-scanner/scan/hmpb/review/next-sheet', {
    status: 404,
    body: '',
  });
  await expect(fetchNextBallotSheetToReview()).resolves.toBeUndefined();
});
