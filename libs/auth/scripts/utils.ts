import { sleep } from '@votingworks/basics';

import { CardStatusReady, StatefulCard } from '../src/card';

/**
 * Waits for a card to have a ready status
 */
export async function waitForReadyCardStatus<T>(
  card: StatefulCard<T>,
  waitTimeSeconds = 3
): Promise<CardStatusReady<T>> {
  let cardStatus = await card.getCardStatus();
  let remainingWaitTimeSeconds = waitTimeSeconds;
  while (cardStatus.status !== 'ready' && remainingWaitTimeSeconds > 0) {
    await sleep(1000);
    cardStatus = await card.getCardStatus();
    remainingWaitTimeSeconds -= 1;
  }
  if (cardStatus.status !== 'ready') {
    throw new Error(`Card status not "ready" after ${waitTimeSeconds} seconds`);
  }
  return cardStatus;
}
