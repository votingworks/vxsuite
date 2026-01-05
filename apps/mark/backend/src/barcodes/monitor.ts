/* istanbul ignore file - hardware interface worker thread - @preserve */
/* eslint-disable vx/gts-unicode-escapes */

import * as hid from 'node-hid';
import { Buffer } from 'node:buffer';
import util from 'node:util';

import { parentPort } from 'node:worker_threads';
import { sleep } from '@votingworks/basics';
import { execFileSync } from 'node:child_process';
import { BaseLogger, LogEventId, LogSource } from '@votingworks/logging';
import { usb } from 'usb';
import { ScanEvent } from './types';
import { NODE_ENV } from '../globals';

// [TODO] Figure out configuration command protocol.
const CONFIGURE_ON_STARTUP = true;

// Honeywell CM4680SR (AKA Metrologic Instruments CM4680SR):
const VENDOR_ID = 0x0c2e;
const PRODUCT_ID = 0x10d3;

const logger = new BaseLogger(LogSource.VxMarkBackend);

// Track the active scanner connection so we can close it on shutdown
let activeScanner: hid.HID | undefined;

function connect() {
  const devices = hid.devices(VENDOR_ID, PRODUCT_ID);

  if (devices.length === 0) {
    logger.log(LogEventId.Info, 'system', {
      disposition: 'failure',
      message: 'barcode scanner not available - waiting for connection...',
    });

    // inform parent thread of current connection status
    parentPort?.postMessage({ type: 'status', connected: false });

    return;
  }

  devEnsureDeviceAccess(devices[0].path);

  activeScanner = new hid.HID(devices[0].vendorId, devices[0].productId)
    .on('data', onData)
    .on('error', onError);

  logger.log(LogEventId.Info, 'system', {
    disposition: 'success',
    message: 'barcode scanner connection established',
  });

  // inform parent thread of current connection status
  parentPort?.postMessage({ type: 'status', connected: true });

  if (CONFIGURE_ON_STARTUP) void configure(activeScanner);
}

const CARRIAGE_RETURN = '\r'.charCodeAt(0);

function onAttach(d: usb.Device) {
  if (
    d.deviceDescriptor.idVendor !== VENDOR_ID ||
    d.deviceDescriptor.idProduct !== PRODUCT_ID
  ) {
    return;
  }

  void connect();
}

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

function devEnsureDeviceAccess(devicePath?: string) {
  if (NODE_ENV !== 'development' || !devicePath?.trim()) return;

  execFileSync('sudo', ['chmod', '777', devicePath]);
}

function shutdown() {
  logger.log(LogEventId.Info, 'system', {
    message: 'barcode monitor: shutting down',
  });
  usb.removeAllListeners('attach');
  if (activeScanner) {
    activeScanner.removeAllListeners();
    activeScanner.close();
    activeScanner = undefined;
  }
}

connect();
usb.on('attach', onAttach);

// Listen for shutdown message from parent thread
parentPort?.on('message', (msg) => {
  if (msg === 'shutdown') {
    shutdown();
  }
});
