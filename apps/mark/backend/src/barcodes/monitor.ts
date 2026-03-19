/* istanbul ignore file - hardware interface worker thread - @preserve */
/* eslint-disable vx/gts-unicode-escapes */

import * as hid from 'node-hid';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import util from 'node:util';

import { parentPort } from 'node:worker_threads';
import { sleep } from '@votingworks/basics';
import { BaseLogger, LogEventId, LogSource } from '@votingworks/logging';
import { ScanEvent } from './types.js';

// Inline udev monitor to avoid importing @votingworks/backend, which
// transitively loads pcsclite (smart card library) and canvas — both of which
// are incompatible with Node.js Worker threads and cause fatal crashes.
interface UdevMonitor {
  stop(): void;
}

function createUdevMonitor(
  subsystem: string,
  onEvent: () => void
): UdevMonitor {
  let monitorProcess: ReturnType<typeof spawn> | undefined;
  let stopped = false;
  // Debounce events from `udevadm monitor` stdout, as a single udev event
  // may produce multiple stdout chunks.
  let eventTimeout: NodeJS.Timeout | undefined;

  function start(): void {
    if (stopped) return;
    const proc = spawn('udevadm', [
      'monitor',
      '--udev',
      `--subsystem-match=${subsystem}`,
    ]);
    monitorProcess = proc;
    proc.stdout.on('data', () => {
      if (stopped) return;
      if (eventTimeout) {
        clearTimeout(eventTimeout);
      }
      eventTimeout = setTimeout(() => {
        if (!stopped) {
          onEvent();
        }
      }, 100);
    });
    proc.on('error', () => {
      // ignore errors from udevadm monitor
    });
    proc.on('exit', () => {
      monitorProcess = undefined;
      if (!stopped) {
        setTimeout(start, 1_000);
      }
    });
  }

  start();

  return {
    stop(): void {
      stopped = true;
      monitorProcess?.kill();
    },
  };
}

// [TODO] Figure out configuration command protocol.
const CONFIGURE_ON_STARTUP = true;

const SETUP_SCRIPT = 'apps/mark/backend/scripts/setup_udev_rules.sh';

// Honeywell CM4680SR (AKA Metrologic Instruments CM4680SR):
const VENDOR_ID = 0x0c2e;
const PRODUCT_ID = 0x10d3;

const logger = new BaseLogger(LogSource.VxMarkBackend);

// Track the active scanner connection so we can close it on shutdown
let activeScanner: hid.HID | undefined;
let udevMonitor: UdevMonitor | undefined;

function connect() {
  // If a scanner is already connected, avoid reopening it or spamming logs.
  if (activeScanner) {
    return;
  }

  const devices = hid.devices(VENDOR_ID, PRODUCT_ID);

  if (devices.length === 0) {
    logger.log(LogEventId.Info, 'system', {
      disposition: 'failure',
      message: 'barcode scanner not available - waiting for connection...',
    });
    parentPort?.postMessage({ type: 'status', connected: false });
    return;
  }

  try {
    activeScanner = new hid.HID(devices[0].vendorId, devices[0].productId)
      .on('data', onData)
      .on('error', onError);
  } catch (error) {
    const isPermissionError =
      error instanceof Error &&
      /permission denied|unable to open/i.test(error.message);
    logger.log(LogEventId.UnknownError, 'system', {
      disposition: 'failure',
      message: isPermissionError
        ? `barcode scanner permission denied - run 'sudo ${SETUP_SCRIPT}' to install udev rules`
        : 'failed to open barcode scanner',
      error: util.inspect(error),
    });
    parentPort?.postMessage({ type: 'status', connected: false });
    return;
  }

  logger.log(LogEventId.Info, 'system', {
    disposition: 'success',
    message: 'barcode scanner connection established',
  });
  parentPort?.postMessage({ type: 'status', connected: true });
  if (CONFIGURE_ON_STARTUP) void configure(activeScanner);
}

const CARRIAGE_RETURN = '\r'.charCodeAt(0);

// [TODO] Figure out why first scan after startup doesn't register.
function onData(data: Buffer) {
  // Ignore newline outputs after each real payload.
  if (data[0] === CARRIAGE_RETURN) return;

  const event: ScanEvent = { type: 'scan', data };
  parentPort?.postMessage(event, [data.buffer as ArrayBuffer]);
}

function onError(error: unknown) {
  logger.log(LogEventId.UnknownError, 'system', {
    disposition: 'failure',
    message: 'unexpected barcode scanner error',
    error: util.inspect(error),
  });
  // in case of error, report disconnected status
  parentPort?.postMessage({ type: 'status', connected: false });
}

enum Cmd {
  STARTUP_BEEPER_OFF = 'BEPPWR0',
  PROGRAMMING_BARCODE_SECURITY_ENABLE = 'MNUENA0',
}

async function configure(scanner: hid.HID) {
  await sendCommand(scanner, Cmd.STARTUP_BEEPER_OFF);
  await sendCommand(scanner, Cmd.PROGRAMMING_BARCODE_SECURITY_ENABLE);
}

const CMD_PREFIX = '\x16M\r';
const CMD_TERMINATOR = '.';
const CMD_REGISTERED_ESTIMATED_DELAY_MS = 100;

async function sendCommand(scanner: hid.HID, cmd: Cmd) {
  scanner.write(Buffer.from(`${CMD_PREFIX}${cmd}${CMD_TERMINATOR}\n`));
  await sleep(CMD_REGISTERED_ESTIMATED_DELAY_MS);
}

function shutdown() {
  logger.log(LogEventId.Info, 'system', {
    message: 'barcode monitor: shutting down',
  });
  udevMonitor?.stop();
  if (activeScanner) {
    activeScanner.removeAllListeners();
    activeScanner.close();
    activeScanner = undefined;
  }
}

connect();
// Use udevadm monitor rather than libusb attach events: udev fires after all
// rules are processed, so the hidraw device node is guaranteed to be
// accessible when connect() is called.
udevMonitor = createUdevMonitor('hidraw', connect);

// Listen for shutdown message from parent thread
parentPort?.on('message', (msg) => {
  if (msg === 'shutdown') {
    shutdown();
  }
});
