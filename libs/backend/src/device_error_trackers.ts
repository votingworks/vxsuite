/* eslint-disable max-classes-per-file */
import { CardStatus } from '@votingworks/auth';
import { assert, throwIllegalValue } from '@votingworks/basics';

/**
 * How long to wait after startup before tracking errors as hardware may take a moment to register
 * as connected
 */
export const GRACE_PERIOD_MS = 10_000;

/**
 * The number of consecutive errors, after a device has registered as connected at least once,
 * before crashing
 */
export const CONSECUTIVE_ERRORS_BEFORE_CRASHING = 3;

/**
 * A single health reading
 */
export type HealthReading = 'connected' | 'disconnected' | 'inconclusive';

/**
 * Used in the hardware test apps to trigger a crash and corresponding auto-restart for recovery
 * without user intervention. Tracking doesn't begin until the device has registered as connected
 * at least once so that a machine intentionally run without the device doesn't crash.
 */
export class DeviceErrorTracker {
  private readonly startTime: number;
  private hasRegisteredAsConnected = false;
  private consecutiveErrors = 0;

  constructor(private readonly deviceName: string) {
    this.startTime = Date.now();
  }

  assertHealthy(): void {
    assert(
      this.consecutiveErrors < CONSECUTIVE_ERRORS_BEFORE_CRASHING,
      `${this.deviceName} failed ${this.consecutiveErrors} consecutive health checks`
    );
  }

  protected recordHealthReading(healthReading: HealthReading): void {
    // Tracking doesn't begin until a device registers as connected. Err on the side of tracking if
    // the initial health reading is inconclusive.
    if (healthReading === 'connected' || healthReading === 'inconclusive') {
      this.hasRegisteredAsConnected = true;
    }

    const inGracePeriod = Date.now() - this.startTime < GRACE_PERIOD_MS;
    if (inGracePeriod) {
      return;
    }

    switch (healthReading) {
      case 'connected': {
        this.consecutiveErrors = 0;
        break;
      }
      case 'inconclusive': {
        // Inconclusive readings are treated as error readings if they follow an error reading and
        // as healthy readings if they follow a healthy reading
        if (this.consecutiveErrors > 0) {
          this.consecutiveErrors += 1;
        }
        break;
      }
      case 'disconnected': {
        if (this.hasRegisteredAsConnected) {
          this.consecutiveErrors += 1;
        }
        break;
      }
      default: {
        throwIllegalValue(healthReading);
      }
    }
  }
}

/**
 * Tracks barcode reader health. See {@link DeviceErrorTracker}.
 */
export class BarcodeReaderErrorTracker extends DeviceErrorTracker {
  constructor() {
    super('Barcode reader');
  }

  update({ connected }: { connected: boolean }): void {
    const healthReading: HealthReading = connected
      ? 'connected'
      : 'disconnected';
    this.recordHealthReading(healthReading);
  }
}

/**
 * Tracks card reader health. See {@link DeviceErrorTracker}.
 */
export class CardReaderErrorTracker extends DeviceErrorTracker {
  constructor() {
    super('Card reader');
  }

  update({ status }: { status: CardStatus['status'] }): void {
    const healthReading: HealthReading = (() => {
      if (status === 'ready') return 'connected';
      if (status === 'no_card_reader') return 'disconnected';
      return 'inconclusive';
    })();
    this.recordHealthReading(healthReading);
  }
}

/**
 * Tracks external printer health. See {@link DeviceErrorTracker}.
 */
export class ExternalPrinterErrorTracker extends DeviceErrorTracker {
  constructor() {
    super('External printer');
  }

  update({ connected }: { connected: boolean }): void {
    const healthReading: HealthReading = connected
      ? 'connected'
      : 'disconnected';
    this.recordHealthReading(healthReading);
  }
}
