/* eslint-disable vx/gts-unicode-escapes */
/* istanbul ignore file - scratch implementation for demo - @preserve */

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
const CONFIGURE_ON_STARTUP = false;

const VENDOR_ID = 0x23d0;
const PRODUCT_ID = 0x0d13;

const logger = new BaseLogger(LogSource.VxMarkBackend);

function connect() {
  const devices = hid.devices(0x23d0, 0x0d13);

  if (devices.length === 0) {
    logger.log(LogEventId.Info, 'system', {
      disposition: 'failure',
      message: 'barcode scanner not available - waiting for connection...',
    });

    return;
  }

  devEnsureDeviceAccess(devices[0].path);

  const scanner = new hid.HID(devices[0].vendorId, devices[0].productId)
    .on('data', onData)
    .on('error', onError);

  logger.log(LogEventId.Info, 'system', {
    disposition: 'success',
    message: 'barcode scanner connection established',
  });

  if (CONFIGURE_ON_STARTUP) void configure(scanner);
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

  const event: ScanEvent = { data };
  parentPort?.postMessage(event, [data.buffer as ArrayBuffer]);
}

function onError(error: unknown) {
  logger.log(LogEventId.UnknownError, 'system', {
    disposition: 'failure',
    message: 'unexpected barcode scanner error',
    error: util.inspect(error),
  });
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

connect();
usb.on('attach', onAttach);
