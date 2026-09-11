import { beforeEach, expect, test, vi } from 'vitest';
import { CardStatus } from '@votingworks/auth';

import {
  BarcodeReaderErrorTracker,
  CardReaderErrorTracker,
  ExternalPrinterErrorTracker,
  GRACE_PERIOD_MS,
} from './device_error_trackers.js';

let tracker: CardReaderErrorTracker;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  tracker = new CardReaderErrorTracker();
});

function advancePastGracePeriod(): void {
  vi.advanceTimersByTime(GRACE_PERIOD_MS);
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
    description: 'one no_card_reader after reader registers',
    cardStatusSequence: ['grace_period_complete', 'ready', 'no_card_reader'],
    shouldCardReaderBeConsideredHealthy: true,
  },
  {
    description: 'two no_card_reader after reader registers',
    cardStatusSequence: [
      'grace_period_complete',
      'ready',
      'no_card_reader',
      'no_card_reader',
    ],
    shouldCardReaderBeConsideredHealthy: true,
  },
  {
    description: 'three no_card_reader after reader registers, threshold hit',
    cardStatusSequence: [
      'grace_period_complete',
      'ready',
      'no_card_reader',
      'no_card_reader',
      'no_card_reader',
    ],
    shouldCardReaderBeConsideredHealthy: false,
  },
  {
    description:
      'no_card signifies that reader has registered and tracking can begin',
    cardStatusSequence: [
      'grace_period_complete',
      'no_card',
      'no_card_reader',
      'no_card_reader',
      'no_card_reader',
    ],
    shouldCardReaderBeConsideredHealthy: false,
  },
  {
    description: 'reader never registers, so tracking never starts',
    cardStatusSequence: [
      'grace_period_complete',
      'no_card_reader',
      'no_card_reader',
      'no_card_reader',
    ],
    shouldCardReaderBeConsideredHealthy: true,
  },
  {
    description: 'reader registering during grace period counts',
    cardStatusSequence: [
      'ready',
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
      'ready',
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
      'ready',
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
      'ready',
      'no_card_reader',
      'no_card',
      'no_card',
    ],
    shouldCardReaderBeConsideredHealthy: false,
  },
  {
    description: 'card_error and unknown_error continue an error streak',
    cardStatusSequence: [
      'grace_period_complete',
      'ready',
      'no_card_reader',
      'card_error',
      'unknown_error',
    ],
    shouldCardReaderBeConsideredHealthy: false,
  },
  {
    description: 'card_error and unknown_error not inherently a problem',
    cardStatusSequence: [
      'grace_period_complete',
      'card_error',
      'unknown_error',
      'card_error',
      'unknown_error',
    ],
    shouldCardReaderBeConsideredHealthy: true,
  },
  {
    description: 'realistic starting sequence without a card inserted',
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
    description: 'realistic starting sequence with a card inserted',
    cardStatusSequence: [
      'no_card_reader',
      'ready',
      'ready',
      'grace_period_complete',
      'ready',
      'ready',
      'ready',
    ],
    shouldCardReaderBeConsideredHealthy: true,
  },
  {
    description: 'ready resets tracking',
    cardStatusSequence: [
      'grace_period_complete',
      'ready',
      'no_card_reader',
      'no_card_reader',
      'ready',
    ],
    shouldCardReaderBeConsideredHealthy: true,
  },
  {
    description: 'ready resets tracking multiple times',
    cardStatusSequence: [
      'grace_period_complete',
      'ready',
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
      'ready',
      'no_card_reader',
      'no_card_reader',
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

test('Device names in assertion messages', () => {
  const trackersAndDeviceNames = [
    [new BarcodeReaderErrorTracker(), 'Barcode reader'],
    [new CardReaderErrorTracker(), 'Card reader'],
    [new ExternalPrinterErrorTracker(), 'External printer'],
  ] as const;

  for (const [deviceTracker, deviceName] of trackersAndDeviceNames) {
    advancePastGracePeriod();
    if (deviceName === 'Card reader') {
      deviceTracker.update({ status: 'ready' });
      deviceTracker.update({ status: 'no_card_reader' });
      deviceTracker.update({ status: 'no_card_reader' });
      deviceTracker.update({ status: 'no_card_reader' });
    } else {
      deviceTracker.update({ connected: true });
      deviceTracker.update({ connected: false });
      deviceTracker.update({ connected: false });
      deviceTracker.update({ connected: false });
    }
    expect(() => deviceTracker.assertHealthy()).toThrow(
      `${deviceName} failed 3 consecutive health checks`
    );
  }
});
