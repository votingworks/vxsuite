import { CardStatus } from '@votingworks/auth';
import { assert } from '@votingworks/basics';

/**
 * How long to wait after startup before tracking card reader errors as the card reader may take a
 * moment to register as connected
 */
export const CARD_READER_GRACE_PERIOD_MS = 10_000;

/**
 * The number of consecutive errors (including no_card) after a no_card_reader event before
 * crashing
 */
export const CONSECUTIVE_ERRORS_AFTER_NO_CARD_READER_EVENT_BEFORE_CRASHING = 2;

/**
 * Tracks card reader health, crashing if the reader is having issues. Used in the hardware test
 * apps to trigger a crash and corresponding auto-restart for recovery without user intervention.
 */
export class CardReaderErrorTracker {
  private readonly startTime: number;
  private noCardReaderEventSeen = false;
  private consecutiveErrorsAfterNoCardReaderEvent = 0;

  constructor() {
    this.startTime = Date.now();
  }

  assertHealthy(): void {
    assert(
      this.consecutiveErrorsAfterNoCardReaderEvent <
        CONSECUTIVE_ERRORS_AFTER_NO_CARD_READER_EVENT_BEFORE_CRASHING,
      'Card reader registered as disconnected and ' +
        `${this.consecutiveErrorsAfterNoCardReaderEvent} subsequent reads failed`
    );
  }

  update(cardStatus: { status: CardStatus['status'] }): void {
    const inGracePeriod =
      Date.now() - this.startTime < CARD_READER_GRACE_PERIOD_MS;
    if (inGracePeriod) {
      return;
    }

    // Reset error tracking any time we register a successful card read
    if (cardStatus.status === 'ready') {
      this.noCardReaderEventSeen = false;
      this.consecutiveErrorsAfterNoCardReaderEvent = 0;
      return;
    }

    if (!this.noCardReaderEventSeen && cardStatus.status === 'no_card_reader') {
      this.noCardReaderEventSeen = true;
    } else if (this.noCardReaderEventSeen) {
      this.consecutiveErrorsAfterNoCardReaderEvent += 1;
    }
  }
}
