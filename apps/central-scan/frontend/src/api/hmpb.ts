import { Scan } from '@votingworks/api';
import { unsafeParse } from '@votingworks/types';

export async function fetchNextBallotSheetToReview(): Promise<
  Scan.GetNextReviewSheetResponse | undefined
> {
  const response = await fetch('/central-scanner/scan/hmpb/review/next-sheet');

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error('fetch response is not ok');
  }

  return unsafeParse(
    Scan.GetNextReviewSheetResponseSchema,
    await response.json()
  );
}
