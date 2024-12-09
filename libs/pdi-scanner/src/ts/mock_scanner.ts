import {
  assign as xassign,
  createMachine,
  interpret,
  Assigner,
  PropertyAssigner,
} from 'xstate';
import { SheetOf, ImageData } from '@votingworks/types';
import { assertDefined, err, ok, sleep } from '@votingworks/basics';
import makeDebug from 'debug';
import {
  EjectMotion,
  Listener,
  ScannerClient,
  ScannerEvent,
  ScannerStatus,
} from './scanner_client';

const debug = makeDebug('mock-pdi-scanner');

const baseStatus: ScannerStatus = {
  rearLeftSensorCovered: false,
  rearRightSensorCovered: false,
  branderPositionSensorCovered: false,
  hiSpeedMode: true,
  coverOpen: false,
  scannerEnabled: false,
  frontLeftSensorCovered: false,
  frontM1SensorCovered: false,
  frontM2SensorCovered: false,
  frontM3SensorCovered: false,
  frontM4SensorCovered: false,
  frontM5SensorCovered: false,
  frontRightSensorCovered: false,
  scannerReady: true,
  xmtAborted: false,
  documentJam: false,
  scanArrayPixelError: false,
  inDiagnosticMode: false,
  documentInScanner: false,
  calibrationOfUnitNeeded: false,
};

/**
 * Mock PDI {@link ScannerStatus} values, mocking the return value of
 * {@link ScannerClient.getScannerStatus}.
 */
export const mockScannerStatus = {
  idleScanningDisabled: baseStatus,
  idleScanningEnabled: {
    ...baseStatus,
    scannerEnabled: true,
  },
  documentInRear: {
    ...baseStatus,
    rearLeftSensorCovered: true,
    rearRightSensorCovered: true,
    documentInScanner: true,
  },
  documentInFront: {
    ...baseStatus,
    frontLeftSensorCovered: true,
    frontM1SensorCovered: true,
    frontM2SensorCovered: true,
    frontM3SensorCovered: true,
    frontM4SensorCovered: true,
    documentInScanner: true,
  },
  jammed: {
    ...baseStatus,
    rearLeftSensorCovered: true,
    frontLeftSensorCovered: true,
    frontM1SensorCovered: true,
    documentInScanner: true,
    documentJam: true,
  },
  coverOpen: {
    ...baseStatus,
    coverOpen: true,
  },
  jammedCoverOpen: {
    ...baseStatus,
    rearLeftSensorCovered: true,
    frontLeftSensorCovered: true,
    frontM1SensorCovered: true,
    documentInScanner: true,
    documentJam: true,
    coverOpen: true,
  },
  documentInFrontAndRear: {
    ...baseStatus,
    frontLeftSensorCovered: true,
    frontM1SensorCovered: true,
    frontM2SensorCovered: true,
    frontM3SensorCovered: true,
    frontM4SensorCovered: true,
    rearLeftSensorCovered: true,
    rearRightSensorCovered: true,
    documentInScanner: true,
  },
} satisfies Record<string, ScannerStatus>;

interface MachineContext {
  scanImages?: SheetOf<ImageData>;
}

type MachineEvent =
  | { type: 'CONNECT' }
  | { type: 'DISCONNECT' }
  | { type: 'ENABLE_SCANNING' }
  | { type: 'DISABLE_SCANNING' }
  | { type: 'EJECT_DOCUMENT'; motion: EjectMotion }
  | { type: 'INSERT_SHEET'; images: SheetOf<ImageData> }
  | { type: 'REMOVE_SHEET' };

function assign(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arg: Assigner<MachineContext, any> | PropertyAssigner<MachineContext, any>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return xassign<MachineContext, any>(arg);
}

/**
 * An enum of statuses for the mock sheet of paper "inserted" into the mock
 * scanner.
 */
export type MockSheetStatus = 'noSheet' | 'sheetInserted' | 'sheetHeldInFront';

/**
 * Mock PDI scanner. Provides a mock {@link ScannerClient} and methods for
 * simulating inserting/removing a sheet of paper.
 */
export interface MockScanner {
  client: ScannerClient;
  insertSheet(images: SheetOf<ImageData>): void;
  removeSheet(): void;
  getSheetStatus(): MockSheetStatus;
  cleanup(): Promise<void>;
}

/**
 * Creates a {@link MockScanner} that simulates the behavior of the PDI scanner.
 */
export function createMockPdiScanner(): MockScanner {
  const listeners = new Set<Listener>();
  function emitScannerEvent(event: ScannerEvent) {
    /* istanbul ignore next */
    if (listeners.size === 0) {
      throw new Error(
        `No listeners registered, got event: ${JSON.stringify(event)}`
      );
    }
    // Snapshot the current set of listeners so that new listeners can be
    // added/removed as a side effect of calling a listener without also
    // receiving this event.
    for (const listener of [...listeners]) {
      listener(event);
    }
  }

  const mockScannerStateMachine = createMachine<MachineContext, MachineEvent>({
    id: 'mock-pdi-scanner',
    strict: true,
    predictableActionArguments: true,
    initial: 'disconnected',
    context: {},

    on: {
      DISCONNECT: 'disconnected',
      '*': {
        actions: (_, event) => {
          /* istanbul ignore next */
          emitScannerEvent({
            event: 'error',
            code: 'other',
            message: `Unexpected mock scanner machine event: ${event.type}`,
          });
        },
      },
    },

    states: {
      disconnected: {
        on: {
          CONNECT: 'idleScanningDisabled',
        },
      },

      idleScanningDisabled: {
        on: {
          ENABLE_SCANNING: 'idleScanningEnabled',
          DISABLE_SCANNING: {},
          INSERT_SHEET: {},
        },
      },

      idleScanningEnabled: {
        on: {
          DISABLE_SCANNING: 'idleScanningDisabled',
          INSERT_SHEET: {
            target: 'scanning',
            actions: [
              () => emitScannerEvent({ event: 'scanStart' }),
              assign({ scanImages: (_, event) => event.images }),
            ],
          },
        },
      },

      scanning: {
        after: {
          1000: {
            actions: [
              (context) =>
                emitScannerEvent({
                  event: 'scanComplete',
                  images: assertDefined(context.scanImages),
                }),
              assign({ scanImages: undefined }),
            ],
            target: 'sheetInBack',
          },
        },
      },

      sheetInBack: {
        on: {
          EJECT_DOCUMENT: [
            {
              cond: (_, event) => event.motion === 'toFrontAndHold',
              target: 'ejectingToFrontAndHold',
            },
            {
              cond: (_, event) => event.motion === 'toRear',
              target: 'ejectingToRear',
            },
          ],
        },
      },

      sheetInFront: {
        on: {
          EJECT_DOCUMENT: [
            {
              cond: (_, event) => event.motion === 'toRear',
              target: 'ejectingToRear',
            },
          ],
          // pdictl disables scanning after ejecting, and we had to eject
          // previously for the paper to be in front
          REMOVE_SHEET: 'idleScanningDisabled',
        },
      },

      ejectingToRear: {
        after: {
          1000: {
            // pdictl disables scanning after ejecting
            target: 'idleScanningDisabled',
          },
        },
      },

      ejectingToFrontAndHold: {
        after: {
          1000: {
            target: 'sheetInFront',
          },
        },
      },
    },
  });
  const mockScanner = interpret(mockScannerStateMachine).start();
  mockScanner
    .onTransition((state) => {
      debug(`Transitioned to: ${state.value}`);
    })
    .onEvent((event) => {
      debug(`Event: ${event.type}`);
    });

  async function waitForState(
    stateMatch: string,
    timeout = 1000
  ): Promise<void> {
    await Promise.race([
      new Promise<void>((resolve) => {
        mockScanner.onTransition(function listener(state) {
          if (state.matches(stateMatch)) {
            mockScanner.off(listener);
            resolve();
          }
        });
      }),
      sleep(timeout).then(() => {
        throw new Error(`Timed out waiting for state: ${stateMatch}`);
      }),
    ]);
  }

  function simulateCommandDelay() {
    return sleep(100);
  }

  const client: ScannerClient = {
    addListener(listener: Listener) {
      listeners.add(listener);
      return listener;
    },

    removeListener(listener: Listener) {
      listeners.delete(listener);
    },

    async connect() {
      await simulateCommandDelay();
      mockScanner.send('CONNECT');
      await waitForState('idleScanningDisabled');
      return ok();
    },

    async getScannerStatus() {
      await simulateCommandDelay();
      const { state } = mockScanner;
      switch (true) {
        case state.matches('disconnected'):
          return err({ code: 'disconnected' });
        case state.matches('idleScanningDisabled'):
          return ok(mockScannerStatus.idleScanningDisabled);
        case state.matches('idleScanningEnabled'):
          return ok(mockScannerStatus.idleScanningEnabled);
        case state.matches('scanning'):
          return ok(mockScannerStatus.documentInFrontAndRear);
        case state.matches('sheetInBack'):
          return ok(mockScannerStatus.documentInRear);
        case state.matches('sheetInFront'):
          return ok(mockScannerStatus.documentInFront);
        case state.matches('ejectingToRear'):
        case state.matches('ejectingToFrontAndHold'):
          return ok(mockScannerStatus.documentInFrontAndRear);
        /* istanbul ignore next */
        default:
          return err({
            code: 'other',
            message: `Unexpected state: ${state.value}`,
          });
      }
    },

    async enableScanning() {
      await simulateCommandDelay();
      mockScanner.send('ENABLE_SCANNING');
      return ok();
    },

    async disableScanning() {
      await simulateCommandDelay();
      mockScanner.send('DISABLE_SCANNING');
      return ok();
    },

    async ejectDocument(motion: EjectMotion) {
      await simulateCommandDelay();
      mockScanner.send({ type: 'EJECT_DOCUMENT', motion });
      return ok();
    },

    /* istanbul ignore next */
    calibrateDoubleFeedDetection() {
      throw new Error('Not implemented');
    },

    /* istanbul ignore next */
    getDoubleFeedDetectionCalibrationConfig() {
      throw new Error('Not implemented');
    },

    async disconnect() {
      await simulateCommandDelay();
      mockScanner.send('DISCONNECT');
      return ok();
    },

    /* istanbul ignore next */
    exit() {
      throw new Error('Not implemented');
    },
  };

  return {
    client,

    insertSheet(images: SheetOf<ImageData>) {
      mockScanner.send({ type: 'INSERT_SHEET', images });
    },

    removeSheet() {
      mockScanner.send('REMOVE_SHEET');
    },

    getSheetStatus() {
      const { state } = mockScanner;
      switch (true) {
        case state.matches('sheetInFront'):
          return 'sheetHeldInFront';
        case state.matches('disconnected'):
        case state.matches('idleScanningDisabled'):
        case state.matches('idleScanningEnabled'):
          return 'noSheet';
        default:
          return 'sheetInserted';
      }
    },

    async cleanup() {
      mockScanner.stop();
      // Jest complains about a worker not exiting gracefully if we don't wait a
      // bit for the machine to stop
      await sleep(500);
    },
  };
}
