import { err, ok, Result } from '@votingworks/types';
import { assert, sleep, throwIllegalValue } from '@votingworks/utils';
import makeDebug from 'debug';
import {
  createMachine,
  assign as xassign,
  Assigner,
  PropertyAssigner,
  interpret,
} from 'xstate';
import { send } from 'xstate/lib/actions';
import { waitFor } from 'xstate/lib/waitFor';
import { ScannerError } from './errors';
import { PaperStatus } from './paper_status';
import {
  AcceptResult,
  CalibrateResult,
  ClientDisconnectedError,
  ClientError,
  CloseResult,
  GetPaperStatusResult,
  InvalidClientResponseError,
  RejectResult,
  ScannerClient,
  ScanResult,
} from './scanner';

/* eslint-disable @typescript-eslint/require-await */

const debug = makeDebug('plustek-sdk:mock-client');

interface Context {
  sheetFiles?: readonly [string, string];
  holdAfterReject?: boolean;
  jamOnNextOperation: boolean;
  scanError?: 'error_feeding' | 'only_one_file_returned';
}

type Event =
  | { type: 'CONNECT' }
  | { type: 'DISCONNECT' }
  | { type: 'POWER_OFF' }
  | { type: 'CRASH' }
  | { type: 'FREEZE' }
  | {
      type: 'LOAD_SHEET';
      sheetFiles: readonly [string, string];
    }
  | { type: 'REMOVE_SHEET' }
  | { type: 'SCAN' }
  | { type: 'ACCEPT' }
  | { type: 'REJECT'; hold: boolean }
  | { type: 'CALIBRATE' }
  | {
      type: 'SCAN_ERROR';
      error: 'error_feeding' | 'only_one_file_returned';
    }
  | { type: 'JAM_ON_NEXT_OPERATION' }
  | { type: 'CHECK_JAM_FLAG' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assign(arg: Assigner<Context, any> | PropertyAssigner<Context, any>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return xassign<Context, any>(arg);
}

/**
 * A state machine to model the internal state of the Plustek.
 */
const mockPlustekMachine = createMachine<Context, Event>({
  id: 'plustek',
  initial: 'disconnected',
  strict: true,
  context: { jamOnNextOperation: false },
  on: {
    DISCONNECT: 'disconnected',
    POWER_OFF: 'powered_off',
    CRASH: 'crashed',
    FREEZE: 'frozen',
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
    crashed: {},
    frozen: { on: { '*': { target: undefined } } }, // Don't accept any further commands
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
        CALIBRATE: 'calibrating',
        ACCEPT: 'accepting',
        REJECT: {
          target: 'rejecting',
          actions: assign({
            holdAfterReject: (_context, event) => event.hold,
          }),
        },
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
          {
            target: 'ready_to_eject',
            actions: assign({ scanError: (_context, event) => event.error }),
            cond: (_context, event) => event.error === 'only_one_file_returned',
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
        REJECT: {
          target: 'rejecting',
          actions: assign({
            holdAfterReject: (_context, event) => event.hold,
          }),
        },
        LOAD_SHEET: 'both_sides_have_paper',
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
        REJECTING_DELAY: [
          {
            target: 'no_paper',
            cond: (context) => !context.holdAfterReject,
          },
          {
            target: 'no_paper_before_hold',
            cond: (context) => context.holdAfterReject === true,
          },
        ],
      },
      on: { LOAD_SHEET: 'both_sides_have_paper' },
    },
    no_paper_before_hold: {
      after: { HOLD_DELAY: 'ready_to_scan' },
    },
    calibrating: {
      always: {
        target: 'jam',
        cond: (context) => context.jamOnNextOperation,
      },
      after: { CALIBRATING_DELAY: 'no_paper' },
    },
    both_sides_have_paper: {
      on: {
        REMOVE_SHEET: 'ready_to_eject',
        CALIBRATE: 'calibrating',
      },
    },
    jam: {
      entry: assign({ jamOnNextOperation: false }),
      on: { REMOVE_SHEET: 'no_paper' },
    },
  },
});

/**
 * Possible errors the {@link MockScannerClient} might encounter.
 */
export enum Errors {
  DuplicateLoad = 'DuplicateLoad',
  Unresponsive = 'Unresponsive',
  Crashed = 'Crashed',
  NotConnected = 'NotConnected',
  NoPaperToRemove = 'NoPaperToRemove',
}

/**
 * Configuration options for {@link MockScannerClient}.
 */
export interface MockScannerClientOptions {
  /**
   * How long does it take to take or release a paper hold forward or backward?
   */
  toggleHoldDuration?: number;

  /**
   * How long does it take to pass a sheet through the scanner forward or
   * backward?
   */
  passthroughDuration?: number;

  /**
   * How long to hang when in a frozen state
   */
  frozenTimeout?: number;
}

function initMachine(toggleHoldDuration: number, passthroughDuration: number) {
  return interpret(
    mockPlustekMachine.withConfig({
      delays: {
        SCANNING_DELAY: passthroughDuration,
        ACCEPTING_DELAY: toggleHoldDuration,
        REJECTING_DELAY: passthroughDuration,
        HOLD_DELAY: toggleHoldDuration,
        CALIBRATING_DELAY: passthroughDuration * 3,
      },
    })
  );
}

/**
 * Provides a mock `ScannerClient` that acts like the plustek VTM 300.
 */
export class MockScannerClient implements ScannerClient {
  private machine;
  private readonly toggleHoldDuration: number;
  private readonly passthroughDuration: number;
  private readonly frozenTimeout: number;
  constructor({
    toggleHoldDuration = 100,
    passthroughDuration = 1000,
    frozenTimeout = 60_000,
  }: MockScannerClientOptions = {}) {
    this.toggleHoldDuration = toggleHoldDuration;
    this.passthroughDuration = passthroughDuration;
    this.frozenTimeout = frozenTimeout;
    this.machine = initMachine(toggleHoldDuration, passthroughDuration).start();
  }

  /**
   * "Connects" to the mock scanner, must be called before other interactions.
   */
  async connect(): Promise<void> {
    debug('connecting');
    this.machine.send({ type: 'CONNECT' });
    await waitFor(this.machine, (state) => state.value !== 'disconnected');
  }

  /**
   * "Disconnects" from the mock scanner.
   */
  async disconnect(): Promise<void> {
    debug('disconnecting');
    this.machine.send({ type: 'DISCONNECT' });
    await waitFor(this.machine, (state) => state.value === 'disconnected', {
      timeout: this.frozenTimeout,
    });
  }

  /**
   * Loads a sheet with scan images from `files`.
   */
  async simulateLoadSheet(
    files: readonly [string, string]
  ): Promise<Result<void, Errors>> {
    debug('manualLoad files=%o', files);

    if (this.machine.state.value === 'powered_off') {
      debug('cannot load, scanner unresponsive');
      return err(Errors.Unresponsive);
    }

    if (this.machine.state.value === 'crashed') {
      debug('cannot load, plustekctl crashed');
      return err(Errors.Crashed);
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
    debug('manualRemove');

    if (this.machine.state.value === 'powered_off') {
      debug('cannot remove, scanner unresponsive');
      return err(Errors.Unresponsive);
    }

    if (this.machine.state.value === 'crashed') {
      debug('cannot remove, plustekctl crashed');
      return err(Errors.Crashed);
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
   * On the next scan/accept/reject/calibrate operation, simulate a paper jam.
   */
  simulateJamOnNextOperation(): void {
    this.machine.send({ type: 'JAM_ON_NEXT_OPERATION' });
  }

  /**
   * Run during a scan operation to simulate an error pulling the paper into the scanner.
   */
  simulateScanError(error: 'error_feeding' | 'only_one_file_returned'): void {
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
   * Simulates `plustekctl` crashing. Once this happens a new client/connection
   * must be established.
   */
  simulatePlustekctlCrash(): void {
    this.machine.send({ type: 'CRASH' });
  }

  /**
   * Simulates `plustekctl` freezing. Once this happens the process needs to be killed.
   */
  simulatePlustekctlFreeze(): void {
    this.machine.send({ type: 'FREEZE' });
  }

  /**
   * Determines whether the client is connected.
   */
  isConnected(): boolean {
    return !(
      this.machine.state.value === 'disconnected' ||
      this.machine.state.value === 'crashed'
    );
  }

  /**
   * Gets the current paper status.
   */
  async getPaperStatus(): Promise<GetPaperStatusResult> {
    debug('getPaperStatus');
    switch (this.machine.state.value) {
      // When frozen, simulate hanging for a long time
      case 'frozen': {
        const timeStep = 500;
        for (
          let frozenTime = 0;
          frozenTime < this.frozenTimeout;
          frozenTime += timeStep
        ) {
          await sleep(timeStep);
        }
        return err(new Error('Timed out while frozen'));
      }
      case 'powered_off': {
        debug('cannot get paper status, scanner unresponsive');
        return err(ScannerError.SaneStatusIoError);
      }
      case 'crashed': {
        debug('cannot get paper status, plustekctl crashed');
        return err(
          new ClientDisconnectedError('#simulateCrash was previously called')
        );
      }
      case 'disconnected': {
        debug('cannot get paper status, not connected');
        return err(ScannerError.NoDevices);
      }
      case 'no_paper':
      case 'no_paper_before_hold':
        debug('no paper');
        return ok(
          Math.random() > 0.5
            ? PaperStatus.VtmDevReadyNoPaper
            : PaperStatus.NoPaperStatus
        );
      case 'ready_to_scan':
        debug('ready to scan');
        return ok(PaperStatus.VtmReadyToScan);
      case 'ready_to_eject':
        debug('ready to eject');
        return ok(PaperStatus.VtmReadyToEject);
      case 'jam':
        debug('jam');
        return ok(
          Math.random() > 0.5
            ? PaperStatus.VtmFrontAndBackSensorHavePaperReady
            : PaperStatus.Jam
        );
      case 'both_sides_have_paper':
        debug('both sides have paper');
        return ok(PaperStatus.VtmBothSideHavePaper);
      /* istanbul ignore next */
      default:
        throw new Error(`Unexpected state: ${this.machine.state.value}`);
    }
  }

  /**
   * Scans the currently-loaded sheet if any is present.
   */
  async scan(): Promise<ScanResult> {
    debug('scan');
    switch (this.machine.state.value) {
      case 'powered_off': {
        debug('cannot scan, scanner unresponsive');
        return err(ScannerError.SaneStatusIoError);
      }
      case 'crashed': {
        debug('cannot scan, plustekctl crashed');
        return err(
          new ClientDisconnectedError('#simulateCrash was previously called')
        );
      }
      case 'disconnected': {
        debug('cannot scan, not connected');
        return err(ScannerError.NoDevices);
      }
      case 'no_paper':
      case 'no_paper_before_hold': {
        debug('cannot scan, no paper');
        return err(ScannerError.VtmPsDevReadyNoPaper);
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
              /* istanbul ignore next - randomness makes this hard to cover */
              return err(
                Math.random() > 0.5
                  ? ScannerError.PaperStatusErrorFeeding
                  : ScannerError.PaperStatusNoPaper
              );
            case 'only_one_file_returned':
              return err(
                new InvalidClientResponseError(
                  'expected two files, got [ file1.jpg ]'
                )
              );
            /* istanbul ignore next - compile time check for completeness */
            default:
              throwIllegalValue(scanError);
          }
        }
        if ((value as string) === 'jam') {
          debug('scan failed, jam');
          return err(ScannerError.PaperStatusJam);
        }
        if ((value as string) === 'both_sides_have_paper') {
          debug('scan failed, both sides have paper');
          return err(ScannerError.PaperStatusErrorFeeding);
        }
        if ((value as string) === 'powered_off') {
          debug('scan failed, powered off');
          return err(ScannerError.PaperStatusErrorFeeding);
        }
        const files = this.machine.state.context.sheetFiles;
        assert(files);
        debug('scanned files=%o', files);
        return ok({ files: [...files] });
      }
      case 'ready_to_eject': {
        debug('cannot scan, paper is held at back');
        return err(ScannerError.VtmPsReadyToEject);
      }
      case 'jam': {
        debug('cannot scan, jammed');
        return err(ScannerError.PaperStatusJam);
      }
      case 'both_sides_have_paper': {
        debug('cannot scan, both sides have paper');
        return err(ScannerError.VtmBothSideHavePaper);
      }
      /* istanbul ignore next */
      default:
        throw new Error(`Unexpected state: ${this.machine.state.value}`);
    }
  }

  /**
   * Accepts the currently-loaded sheet if any.
   */
  async accept(): Promise<AcceptResult> {
    debug('accept');
    switch (this.machine.state.value) {
      case 'powered_off': {
        debug('cannot accept, scanner unresponsive');
        return err(ScannerError.SaneStatusIoError);
      }
      case 'crashed': {
        debug('cannot accept, plustekctl crashed');
        return err(
          new ClientDisconnectedError('#simulateCrash was previously called')
        );
      }
      case 'disconnected': {
        debug('cannot accept, not connected');
        return err(ScannerError.NoDevices);
      }
      case 'no_paper':
      case 'no_paper_before_hold': {
        debug('cannot accept, no paper');
        return err(ScannerError.VtmPsDevReadyNoPaper);
      }
      case 'ready_to_scan': {
        this.machine.send({ type: 'ACCEPT' });
        await waitFor(this.machine, (state) => state.value !== 'accepting');
        if ((this.machine.state.value as string) === 'jam') {
          debug('accept failed, jam');
          return err(ScannerError.PaperStatusJam);
        }
        if ((this.machine.state.value as string) === 'powered_off') {
          debug('accept failed, power off');
          return err(ScannerError.PaperStatusJam);
        }
        debug('accept success');
        return ok();
      }
      case 'ready_to_eject': {
        this.machine.send({ type: 'ACCEPT' });
        await waitFor(this.machine, (state) => state.value !== 'accepting');
        if ((this.machine.state.value as string) === 'powered_off') {
          debug('accept failed, power off');
          return err(ScannerError.PaperStatusJam);
        }
        // Weird case where Plustek returns an error even though the paper was accepted
        if ((this.machine.state.value as string) === 'ready_to_scan') {
          debug(
            'accept succeeded but returning jam error because paper in front'
          );
          return err(ScannerError.PaperStatusJam);
        }
        debug('accept success');
        return ok();
      }
      case 'jam': {
        debug('cannot accept, jammed');
        return err(ScannerError.PaperStatusJam);
      }
      case 'both_sides_have_paper': {
        debug('cannot accept, both sides have paper');
        return err(ScannerError.VtmBothSideHavePaper);
      }
      /* istanbul ignore next */
      default:
        throw new Error(`Unexpected state: ${this.machine.state.value}`);
    }
  }

  /**
   * Rejects and optionally holds the currently-loaded sheet if any.
   */
  async reject({ hold }: { hold: boolean }): Promise<RejectResult> {
    debug('reject hold=%s', hold);
    switch (this.machine.state.value) {
      case 'powered_off': {
        debug('cannot reject, scanner unresponsive');
        return err(ScannerError.SaneStatusIoError);
      }
      case 'crashed': {
        debug('cannot reject, plustekctl crashed');
        return err(
          new ClientDisconnectedError('#simulateCrash was previously called')
        );
      }
      case 'disconnected': {
        debug('cannot reject, not connected');
        return err(ScannerError.NoDevices);
      }
      case 'no_paper':
      case 'no_paper_before_hold': {
        debug('cannot reject, no paper');
        return err(ScannerError.VtmPsDevReadyNoPaper);
      }
      case 'ready_to_scan':
      case 'ready_to_eject': {
        this.machine.send({ type: 'REJECT', hold });
        await waitFor(this.machine, (state) => state.value !== 'rejecting');
        if ((this.machine.state.value as string) === 'jam') {
          debug('reject failed, jam');
          return err(ScannerError.PaperStatusJam);
        }
        if ((this.machine.state.value as string) === 'powered_off') {
          debug('reject failed, powered off');
          return err(ScannerError.PaperStatusJam);
        }
        debug('reject success');
        return ok();
      }
      case 'jam': {
        debug('cannot reject, jammed');
        return err(ScannerError.PaperStatusJam);
      }
      case 'both_sides_have_paper': {
        debug('cannot reject, both sides have paper');
        return err(ScannerError.VtmBothSideHavePaper);
      }
      /* istanbul ignore next */
      default:
        throw new Error(`Unexpected state: ${this.machine.state.value}`);
    }
  }

  /**
   * Calibrates the scanner using a blank sheet of paper
   */
  async calibrate(): Promise<CalibrateResult> {
    debug('calibrate');
    switch (this.machine.state.value) {
      case 'powered_off': {
        debug('cannot calibrate, scanner unresponsive');
        return err(ScannerError.SaneStatusIoError);
      }
      case 'crashed': {
        debug('cannot calibrate, plustekctl crashed');
        return err(
          new ClientDisconnectedError('#simulateCrash was previously called')
        );
      }
      case 'disconnected': {
        debug('cannot calibrate, not connected');
        return err(ScannerError.NoDevices);
      }
      case 'no_paper':
      case 'no_paper_before_hold': {
        debug('cannot calibrate, no paper');
        return err(ScannerError.VtmPsDevReadyNoPaper);
      }
      case 'both_sides_have_paper':
      case 'ready_to_scan': {
        this.machine.send({ type: 'CALIBRATE' });
        await waitFor(this.machine, (state) => state.value !== 'calibrating');
        if ((this.machine.state.value as string) === 'jam') {
          debug('calibrate failed, jam');
          return err(ScannerError.PaperStatusJam);
        }
        debug('calibrate success');
        return ok();
      }
      case 'ready_to_eject': {
        debug('cannot calibrate, paper in back');
        return err(ScannerError.SaneStatusNoDocs);
      }
      case 'jam': {
        debug('cannot calibrate, jammed');
        return err(ScannerError.PaperStatusJam);
      }
      /* istanbul ignore next */
      default:
        throw new Error(`Unexpected state: ${this.machine.state.value}`);
    }
  }

  /**
   * Closes the connection to the mock scanner.
   */
  async close(): Promise<CloseResult> {
    debug('close');
    await this.disconnect();
    return ok();
  }

  kill(): Result<void, ClientError> {
    debug('kill');
    this.machine.stop();
    this.machine.start();
    return ok();
  }
}
