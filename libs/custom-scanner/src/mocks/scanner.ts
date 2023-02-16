import {
  assert,
  err,
  ok,
  Result,
  sleep,
  throwIllegalValue,
} from '@votingworks/basics';
import { SheetOf } from '@votingworks/types';
import {
  assign as xassign,
  Assigner,
  createMachine,
  interpret,
  PropertyAssigner,
} from 'xstate';
import { send } from 'xstate/lib/actions';
import { waitFor } from 'xstate/lib/waitFor';
import { debug as rootDebug } from '../debug';
import { StatusInternalMessage } from '../protocol';
import { convertFromInternalStatus } from '../status';
import {
  CustomSensorsBitmask,
  ErrorCode,
  FormMovement,
  ImageFromScanner,
  ReleaseType,
  ScannerStatus,
} from '../types';
import { CustomScanner } from '../types/custom_scanner';

const debug = rootDebug.extend('mocks:scanner');

interface Context {
  sheetFiles?: SheetOf<ImageFromScanner>;
  holdAfterReject?: boolean;
  jamOnNextOperation: boolean;
  scanError?: 'error_feeding';
}

type Event =
  | { type: 'CONNECT' }
  | { type: 'DISCONNECT' }
  | { type: 'POWER_OFF' }
  | {
      type: 'LOAD_SHEET';
      sheetFiles: SheetOf<ImageFromScanner>;
    }
  | { type: 'REMOVE_SHEET' }
  | { type: 'REMOVE_SHEET_FROM_BACK' }
  | { type: 'SCAN' }
  | { type: 'ACCEPT' }
  | { type: 'REJECT' }
  | {
      type: 'SCAN_ERROR';
      error: 'error_feeding';
    }
  | { type: 'JAM_ON_NEXT_OPERATION' }
  | { type: 'CHECK_JAM_FLAG' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assign(arg: Assigner<Context, any> | PropertyAssigner<Context, any>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return xassign<Context, any>(arg);
}

/**
 * A state machine to model the internal state of the Custom A4 Scanner.
 */
const mockCustomMachine = createMachine<Context, Event>({
  id: 'CustomA4Scanner',
  initial: 'disconnected',
  strict: true,
  context: { jamOnNextOperation: false },
  on: {
    DISCONNECT: 'disconnected',
    POWER_OFF: 'powered_off',
    JAM_ON_NEXT_OPERATION: {
      actions: assign({ jamOnNextOperation: true }),
    },
    CHECK_JAM_FLAG: {
      target: 'jam',
      cond: (context) => context.jamOnNextOperation,
    },
  },
  states: {
    powered_off: {},
    disconnected: {
      on: { CONNECT: 'no_paper' },
    },
    no_paper: {
      entry: assign({ sheetFiles: undefined, holdAfterReject: undefined }),
      on: {
        LOAD_SHEET: {
          target: 'ready_to_scan',
          actions: assign({
            sheetFiles: (_context, event) => event.sheetFiles,
          }),
        },
      },
    },
    ready_to_scan: {
      on: {
        REMOVE_SHEET: 'no_paper',
        SCAN: 'scanning',
        ACCEPT: 'accepting',
        REJECT: 'rejecting',
      },
    },
    scanning: {
      entry: [assign({ scanError: undefined }), send('CHECK_JAM_FLAG')],
      after: { SCANNING_DELAY: 'ready_to_eject' },
      on: {
        SCAN_ERROR: [
          {
            target: 'ready_to_scan',
            actions: assign({ scanError: (_context, event) => event.error }),
            cond: (_context, event) => event.error === 'error_feeding',
          },
        ],
        LOAD_SHEET: 'both_sides_have_paper',
      },
    },
    ready_to_eject: {
      on: {
        ACCEPT: [
          // Weird case: paper jams when accepting a paper from ready_to_eject
          // will result in going back to the ready_to_eject state
          {
            cond: (context) => context.jamOnNextOperation,
            target: 'ready_to_eject',
            actions: assign({ jamOnNextOperation: false }),
          },
          {
            target: 'accepting',
          },
        ],
        REJECT: 'rejecting',
        LOAD_SHEET: 'both_sides_have_paper',
        REMOVE_SHEET_FROM_BACK: 'no_paper',
      },
    },
    accepting: {
      entry: send('CHECK_JAM_FLAG'),
      after: { ACCEPTING_DELAY: 'no_paper' },
      // Weird case: If you put in a second paper while accepting, it will accept the
      // first paper and return ready_to_scan paper status (but fail the accept
      // command with a jam error)
      on: { LOAD_SHEET: 'ready_to_scan' },
    },
    rejecting: {
      entry: send('CHECK_JAM_FLAG'),
      after: {
        REJECTING_DELAY: 'no_paper_before_hold',
      },
      on: { LOAD_SHEET: 'both_sides_have_paper' },
    },
    no_paper_before_hold: {
      after: { HOLD_DELAY: 'ready_to_scan' },
    },
    both_sides_have_paper: {
      on: {
        REMOVE_SHEET: 'ready_to_eject',
        REMOVE_SHEET_FROM_BACK: 'ready_to_scan',
      },
    },
    jam: {
      entry: assign({ jamOnNextOperation: false }),
      on: { REMOVE_SHEET: 'no_paper', REMOVE_SHEET_FROM_BACK: 'no_paper' },
    },
  },
});

/**
 * Possible errors the {@link MockCustomScanner} might encounter.
 */
export enum Errors {
  DuplicateLoad = 'DuplicateLoad',
  Unresponsive = 'Unresponsive',
  NotConnected = 'NotConnected',
  NoPaperToRemove = 'NoPaperToRemove',
}

/**
 * Configuration options for {@link MockCustomScanner}.
 */
export interface MockCustomScannerOptions {
  /**
   * How long does it take to take or release a paper hold forward or backward?
   */
  toggleHoldDuration?: number;

  /**
   * How long does it take to pass a sheet through the scanner forward or
   * backward?
   */
  passthroughDuration?: number;
}

function initMachine(toggleHoldDuration: number, passthroughDuration: number) {
  return interpret(
    mockCustomMachine.withConfig({
      delays: {
        SCANNING_DELAY: passthroughDuration,
        ACCEPTING_DELAY: toggleHoldDuration,
        REJECTING_DELAY: passthroughDuration,
        HOLD_DELAY: toggleHoldDuration,
      },
    })
  );
}

function oneOf<T>(...array: T[]): T {
  return array[Math.floor(Math.random() * array.length)] as T;
}

/**
 * Provides a mock `ScannerClient` that acts like the plustek VTM 300.
 */
export class MockCustomScanner implements CustomScanner {
  private machine;
  private readonly toggleHoldDuration: number;
  private readonly passthroughDuration: number;

  constructor({
    toggleHoldDuration = 100,
    passthroughDuration = 1000,
  }: MockCustomScannerOptions = {}) {
    this.toggleHoldDuration = toggleHoldDuration;
    this.passthroughDuration = passthroughDuration;
    this.machine = initMachine(toggleHoldDuration, passthroughDuration).start();
  }

  getReleaseVersion(
    releaseType: ReleaseType
  ): Promise<Result<string, ErrorCode>> {
    return Promise.resolve(ok(`${ReleaseType[releaseType]} 1.0.0`));
  }

  async getStatus(): Promise<Result<ScannerStatus, ErrorCode>> {
    const rawStatusResult = await this.getStatusRaw();
    if (rawStatusResult.isErr()) {
      return rawStatusResult;
    }
    const { status } = convertFromInternalStatus(rawStatusResult.ok());
    return ok(status);
  }

  resetHardware(): Promise<Result<void, ErrorCode>> {
    return Promise.resolve(ok());
  }

  /**
   * "Connects" to the mock scanner, must be called before other interactions.
   */
  async connect(): Promise<Result<void, ErrorCode>> {
    debug('connecting');
    this.machine.send({ type: 'CONNECT' });
    await waitFor(this.machine, (state) => state.value !== 'disconnected');
    return ok();
  }

  /**
   * "Disconnects" from the mock scanner.
   */
  async disconnect(): Promise<void> {
    debug('disconnecting');
    this.machine.send({ type: 'DISCONNECT' });
    await waitFor(this.machine, (state) => state.value === 'disconnected');
  }

  /**
   * Loads a sheet with scan images from `files`.
   */
  async simulateLoadSheet(
    files: SheetOf<ImageFromScanner>
  ): Promise<Result<void, Errors>> {
    debug('manualLoad files=%o', files);

    if (this.machine.state.value === 'powered_off') {
      debug('cannot load, scanner unresponsive');
      return err(Errors.Unresponsive);
    }

    if (this.machine.state.value === 'disconnected') {
      debug('cannot load, not connected');
      return err(Errors.NotConnected);
    }

    if (this.machine.state.value === 'ready_to_scan') {
      debug('cannot load, already loaded');
      return err(Errors.DuplicateLoad);
    }

    this.machine.send({ type: 'LOAD_SHEET', sheetFiles: files });
    await sleep(this.toggleHoldDuration);
    debug('manualLoad success');
    return ok();
  }

  /**
   * Removes a loaded sheet if present.
   */
  async simulateRemoveSheet(): Promise<Result<void, Errors>> {
    await Promise.resolve();
    debug('manualRemove');

    if (this.machine.state.value === 'powered_off') {
      debug('cannot remove, scanner unresponsive');
      return err(Errors.Unresponsive);
    }

    if (this.machine.state.value === 'disconnected') {
      debug('cannot remove, not connected');
      return err(Errors.NotConnected);
    }

    if (
      !(
        this.machine.state.value === 'ready_to_scan' ||
        this.machine.state.value === 'jam' ||
        this.machine.state.value === 'both_sides_have_paper'
      )
    ) {
      debug('cannot remove, no paper');
      return err(Errors.NoPaperToRemove);
    }

    this.machine.send({ type: 'REMOVE_SHEET' });
    debug('manualRemove success');
    return ok();
  }

  /**
   * Removes a loaded sheet from the back if present.
   */
  async simulateRemoveSheetFromBack(): Promise<Result<void, Errors>> {
    await Promise.resolve();
    debug('manualRemoveFromBack state=%s', this.machine.state.value);

    if (this.machine.state.value === 'powered_off') {
      debug('cannot remove from back, scanner unresponsive');
      return err(Errors.Unresponsive);
    }

    if (this.machine.state.value === 'disconnected') {
      debug('cannot remove from back, not connected');
      return err(Errors.NotConnected);
    }

    if (
      !(
        this.machine.state.value === 'ready_to_eject' ||
        this.machine.state.value === 'jam' ||
        this.machine.state.value === 'both_sides_have_paper'
      )
    ) {
      debug('cannot remove from back, no paper');
      return err(Errors.NoPaperToRemove);
    }

    this.machine.send({ type: 'REMOVE_SHEET_FROM_BACK' });
    debug('manualRemoveFromBack success');
    return ok();
  }

  /**
   * On the next scan/accept/reject operation, simulate a paper jam.
   */
  simulateJamOnNextOperation(): void {
    this.machine.send({ type: 'JAM_ON_NEXT_OPERATION' });
  }

  /**
   * Run during a scan operation to simulate an error pulling the paper into the scanner.
   */
  simulateScanError(error: 'error_feeding'): void {
    debug('simulating scan error: %o', error);
    this.machine.send({ type: 'SCAN_ERROR', error });
  }

  /**
   * Simulates an unresponsive scanner, i.e. the once-connected scanner had its
   * cable removed or power turned off. Once a scanner is unresponsive it cannot
   * become responsive again, and a new client/connection must be established.
   */
  simulatePowerOff(): void {
    debug('power off');
    this.machine.send({ type: 'POWER_OFF' });
  }

  /**
   * Simulates turning the scanner back on after it having been turned off. In
   * the real Plustek client, once powered off, a new client must be created.
   * However, for the sake of testing it's sometimes useful to be able to reuse
   * the same mock instance.
   */
  simulatePowerOn(
    initialState:
      | 'no_paper'
      | 'ready_to_scan'
      | 'ready_to_eject'
      | 'jam' = 'no_paper'
  ): void {
    debug('power on, initial state: %s', initialState);
    this.machine = initMachine(
      this.toggleHoldDuration,
      this.passthroughDuration
    ).start(initialState);
  }

  /**
   * Determines whether the client is connected.
   */
  isConnected(): boolean {
    return !(this.machine.state.value === 'disconnected');
  }

  /**
   * Gets the current paper status.
   */
  async getStatusRaw(): Promise<Result<StatusInternalMessage, ErrorCode>> {
    debug('getPaperStatus');
    await Promise.resolve();
    switch (this.machine.state.value) {
      case 'powered_off': {
        debug('cannot get paper status, scanner unresponsive');
        return err(ErrorCode.ScannerOffline);
      }
      case 'disconnected': {
        debug('cannot get paper status, not connected');
        return err(ErrorCode.ScannerOffline);
      }
      case 'no_paper':
      case 'no_paper_before_hold':
        debug('no paper');
        return ok(StatusInternalMessage.default());
      case 'ready_to_scan': {
        debug('ready to scan');
        const status: StatusInternalMessage = {
          ...StatusInternalMessage.default(),
          docSensor:
            CustomSensorsBitmask.INPUT_LEFT_LEFT |
            CustomSensorsBitmask.INPUT_CENTER_LEFT |
            CustomSensorsBitmask.INPUT_CENTER_RIGHT |
            CustomSensorsBitmask.INPUT_RIGHT_RIGHT,
        };
        return ok(status);
      }
      case 'ready_to_eject': {
        debug('ready to eject');
        const status: StatusInternalMessage = {
          ...StatusInternalMessage.default(),
          homeSensor:
            CustomSensorsBitmask.OUTPUT_LEFT_LEFT |
            CustomSensorsBitmask.OUTPUT_CENTER_LEFT |
            CustomSensorsBitmask.OUTPUT_CENTER_RIGHT |
            CustomSensorsBitmask.OUTPUT_RIGHT_RIGHT,
        };
        return ok(status);
      }
      case 'jam': {
        debug('jam');
        const status: StatusInternalMessage = {
          ...StatusInternalMessage.default(),
          docSensor:
            CustomSensorsBitmask.INTERNAL_LEFT |
            CustomSensorsBitmask.INTERNAL_RIGHT,
          paperJam: 'J'.charCodeAt(0),
        };
        return ok(status);
      }
      case 'both_sides_have_paper': {
        debug('both sides have paper');
        const status: StatusInternalMessage = {
          ...StatusInternalMessage.default(),
          docSensor:
            CustomSensorsBitmask.INPUT_LEFT_LEFT |
            CustomSensorsBitmask.INPUT_CENTER_LEFT |
            CustomSensorsBitmask.INPUT_CENTER_RIGHT |
            CustomSensorsBitmask.INPUT_RIGHT_RIGHT,
          homeSensor:
            CustomSensorsBitmask.OUTPUT_LEFT_LEFT |
            CustomSensorsBitmask.OUTPUT_CENTER_LEFT |
            CustomSensorsBitmask.OUTPUT_CENTER_RIGHT |
            CustomSensorsBitmask.OUTPUT_RIGHT_RIGHT,
        };
        return ok(status);
      }
      /* istanbul ignore next */
      default:
        throw new Error(`Unexpected state: ${this.machine.state.value}`);
    }
  }

  /**
   * Scans the currently-loaded sheet if any is present.
   */
  async scan(): Promise<Result<SheetOf<ImageFromScanner>, ErrorCode>> {
    debug('scan');
    switch (this.machine.state.value) {
      case 'powered_off': {
        debug('cannot scan, scanner unresponsive');
        return err(ErrorCode.ScannerOffline);
      }
      case 'disconnected': {
        debug('cannot scan, not connected');
        return err(ErrorCode.ScannerOffline);
      }
      case 'no_paper':
      case 'no_paper_before_hold': {
        debug('cannot scan, no paper');
        return err(ErrorCode.NoDocumentToBeScanned);
      }
      case 'ready_to_scan': {
        this.machine.send({ type: 'SCAN' });
        await waitFor(this.machine, (state) => state.value !== 'scanning');
        const {
          value,
          context: { scanError },
        } = this.machine.state;
        if (scanError) {
          debug('scan failed, error');
          switch (scanError) {
            case 'error_feeding':
              return err(oneOf(ErrorCode.ScanImpeded, ErrorCode.PaperHeldBack));
            /* istanbul ignore next - compile time check for completeness */
            default:
              throwIllegalValue(scanError);
          }
        }
        if ((value as string) === 'jam') {
          debug('scan failed, jam');
          return err(oneOf(ErrorCode.PaperJam, ErrorCode.PaperHeldBack));
        }
        if ((value as string) === 'both_sides_have_paper') {
          debug('scan failed, both sides have paper');
          return err(ErrorCode.ScannerError);
        }
        if ((value as string) === 'powered_off') {
          debug('scan failed, powered off');
          return err(ErrorCode.ScannerOffline);
        }
        const files = this.machine.state.context.sheetFiles;
        assert(files);
        debug('scanned files=%o', files);
        return ok(files);
      }
      case 'ready_to_eject': {
        debug('cannot scan, paper is held at back');
        return err(ErrorCode.NoDocumentToBeScanned);
      }
      case 'jam': {
        debug('cannot scan, jammed');
        return err(oneOf(ErrorCode.PaperJam, ErrorCode.PaperHeldBack));
      }
      case 'both_sides_have_paper': {
        debug('cannot scan, both sides have paper');
        return err(ErrorCode.ScanImpeded);
      }
      /* istanbul ignore next */
      default:
        throw new Error(`Unexpected state: ${this.machine.state.value}`);
    }
  }

  /**
   * Moves the paper as directed.
   */
  async move(movement: FormMovement): Promise<Result<void, ErrorCode>> {
    switch (movement) {
      case FormMovement.EJECT_PAPER_FORWARD:
        return await this.accept();

      case FormMovement.RETRACT_PAPER_BACKWARD:
        return await this.reject();

      /* istanbul ignore next */
      default:
        throw new Error(`Unsupported value: ${movement}`);
    }
  }

  private async accept(): Promise<Result<void, ErrorCode>> {
    debug('accept');
    switch (this.machine.state.value) {
      case 'powered_off': {
        debug('cannot accept, scanner unresponsive');
        return err(ErrorCode.ScannerOffline);
      }
      case 'disconnected': {
        debug('cannot accept, not connected');
        return err(ErrorCode.ScannerOffline);
      }
      case 'no_paper':
      case 'no_paper_before_hold': {
        debug('cannot accept, no paper');
        return err(ErrorCode.NoDocumentScanned);
      }
      case 'ready_to_scan': {
        this.machine.send({ type: 'ACCEPT' });
        await waitFor(this.machine, (state) => state.value !== 'accepting');
        if ((this.machine.state.value as string) === 'jam') {
          debug('accept failed, jam');
          return err(oneOf(ErrorCode.PaperJam, ErrorCode.PaperHeldBack));
        }
        if ((this.machine.state.value as string) === 'powered_off') {
          debug('accept failed, power off');
          return err(ErrorCode.ScannerOffline);
        }
        debug('accept success');
        return ok();
      }
      case 'ready_to_eject': {
        this.machine.send({ type: 'ACCEPT' });
        await waitFor(this.machine, (state) => state.value !== 'accepting');
        if ((this.machine.state.value as string) === 'powered_off') {
          debug('accept failed, power off');
          return err(ErrorCode.ScannerOffline);
        }
        debug('accept success');
        return ok();
      }
      case 'jam': {
        debug('cannot accept, jammed');
        return err(oneOf(ErrorCode.PaperJam, ErrorCode.PaperHeldBack));
      }
      case 'both_sides_have_paper': {
        debug('cannot accept, both sides have paper');
        return err(ErrorCode.ScanImpeded);
      }
      /* istanbul ignore next */
      default:
        throw new Error(`Unexpected state: ${this.machine.state.value}`);
    }
  }

  /**
   * Rejects and optionally holds the currently-loaded sheet if any.
   */
  private async reject(): Promise<Result<void, ErrorCode>> {
    debug('reject');
    switch (this.machine.state.value) {
      case 'powered_off': {
        debug('cannot reject, scanner unresponsive');
        return err(ErrorCode.ScannerOffline);
      }
      case 'disconnected': {
        debug('cannot reject, not connected');
        return err(ErrorCode.ScannerOffline);
      }
      case 'no_paper':
      case 'no_paper_before_hold': {
        debug('cannot reject, no paper');
        return err(ErrorCode.NoDocumentScanned);
      }
      case 'ready_to_scan':
      case 'ready_to_eject': {
        this.machine.send({ type: 'REJECT' });
        await waitFor(this.machine, (state) => state.value !== 'rejecting');
        if ((this.machine.state.value as string) === 'jam') {
          debug('reject failed, jam');
          return err(ErrorCode.PaperJam);
        }
        if ((this.machine.state.value as string) === 'powered_off') {
          debug('reject failed, powered off');
          return err(ErrorCode.ScannerOffline);
        }
        debug('reject success');
        return ok();
      }
      case 'jam': {
        debug('cannot reject, jammed');
        return err(ErrorCode.PaperJam);
      }
      case 'both_sides_have_paper': {
        debug('cannot reject, both sides have paper');
        return err(ErrorCode.ScanImpeded);
      }
      /* istanbul ignore next */
      default:
        throw new Error(`Unexpected state: ${this.machine.state.value}`);
    }
  }
}
