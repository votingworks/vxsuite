import { beforeEach, expect, test, vi } from 'vitest';
import { CardStatus } from '@votingworks/auth';
import {
  CARD_READER_GRACE_PERIOD_MS,
  CardReaderErrorTracker,
} from './card_reader_error_tracker';

let tracker: CardReaderErrorTracker;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  tracker = new CardReaderErrorTracker();
});

function advancePastGracePeriod(): void {
  vi.advanceTimersByTime(CARD_READER_GRACE_PERIOD_MS);
}

test.each<{
  description: string;
  cardStatusSequence: Array<CardStatus['status'] | 'grace_period_complete'>;
  shouldCardReaderBeConsideredHealthy: boolean;
}>([
  {
    description: 'starting state',
    cardStatusSequence: [],
    shouldCardReaderBeConsideredHealthy: true,
  },
  {
    description: 'starting state after grace period',
    cardStatusSequence: ['grace_period_complete'],
    shouldCardReaderBeConsideredHealthy: true,
  },
  {
    description: 'one no_card_reader',
    cardStatusSequence: ['grace_period_complete', 'no_card_reader'],
    shouldCardReaderBeConsideredHealthy: true,
  },
  {
    description: 'two no_card_reader',
    cardStatusSequence: [
      'grace_period_complete',
      'no_card_reader',
      'no_card_reader',
    ],
    shouldCardReaderBeConsideredHealthy: true,
  },
  {
    description: 'three no_card_reader, threshold hit',
    cardStatusSequence: [
      'grace_period_complete',
      'no_card_reader',
      'no_card_reader',
      'no_card_reader',
    ],
    shouldCardReaderBeConsideredHealthy: false,
  },
  {
    description: 'threshold hit before grace period',
    cardStatusSequence: [
      'no_card_reader',
      'no_card_reader',
      'no_card_reader',
      'grace_period_complete',
    ],
    shouldCardReaderBeConsideredHealthy: true,
  },
  {
    description: 'no_card not inherently a problem',
    cardStatusSequence: [
      'grace_period_complete',
      'no_card',
      'no_card',
      'no_card',
    ],
    shouldCardReaderBeConsideredHealthy: true,
  },
  {
    description: 'no_card a problem if preceded by no_card_reader',
    cardStatusSequence: [
      'grace_period_complete',
      'no_card_reader',
      'no_card',
      'no_card',
    ],
    shouldCardReaderBeConsideredHealthy: false,
  },
  {
    description: 'realistic starting sequence',
    cardStatusSequence: [
      'no_card_reader',
      'no_card',
      'no_card',
      'grace_period_complete',
      'no_card',
      'no_card',
      'no_card',
    ],
    shouldCardReaderBeConsideredHealthy: true,
  },
  {
    description: 'ready resets tracking',
    cardStatusSequence: [
      'grace_period_complete',
      'no_card_reader',
      'no_card_reader',
      'ready',
    ],
    shouldCardReaderBeConsideredHealthy: true,
  },
  {
    description: 'ready resets tracking',
    cardStatusSequence: [
      'grace_period_complete',
      'no_card_reader',
      'no_card_reader',
      'ready',
      'no_card_reader',
      'no_card_reader',
    ],
    shouldCardReaderBeConsideredHealthy: true,
  },
  {
    description:
      'ready resets tracking but threshold can still be hit after reset',
    cardStatusSequence: [
      'grace_period_complete',
      'no_card_reader',
      'no_card_reader',
      'ready',
      'no_card_reader',
      'no_card_reader',
      'no_card_reader',
    ],
    shouldCardReaderBeConsideredHealthy: false,
  },
  {
    description: 'transition from healthy to unhealthy',
    cardStatusSequence: [
      'grace_period_complete',
      'ready',
      'no_card_reader',
      'no_card_reader',
      'no_card_reader',
    ],
    shouldCardReaderBeConsideredHealthy: false,
  },
])(
  'Card reader error tracking - $description',
  ({ cardStatusSequence, shouldCardReaderBeConsideredHealthy }) => {
    for (const sequenceEntry of cardStatusSequence) {
      if (sequenceEntry === 'grace_period_complete') {
        advancePastGracePeriod();
        continue;
      }
      tracker.update({ status: sequenceEntry });
    }

    if (shouldCardReaderBeConsideredHealthy) {
      expect(() => tracker.assertHealthy()).not.toThrow();
    } else {
      expect(() => tracker.assertHealthy()).toThrow();
    }
  }
);
