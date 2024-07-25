/* eslint-disable vx/gts-no-public-class-fields */
// props must be public to be defined in the interface

import * as fs from 'fs/promises';
import { open as fsOpen } from '@votingworks/fs';
import { assert } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { LogEventId, BaseLogger } from '@votingworks/logging';
import { join } from 'path';
import {
  FAI_100_STATUS_FILENAME,
  GPIO_PATH_PREFIX,
  PAT_CONNECTION_STATUS_PIN,
  PAT_GPIO_OFFSET,
} from './constants';
import { BmdModelNumber } from '../types';

export interface PatConnectionStatusReaderInterface {
  readonly logger: BaseLogger;
  readonly gpioPathPrefix: string;
  open(): Promise<boolean>;
  close(): Promise<void>;
  isPatDeviceConnected(): Promise<boolean>;
}

export class PatConnectionStatusReader
  implements PatConnectionStatusReaderInterface
{
  private file?: fs.FileHandle;

  constructor(
    readonly logger: BaseLogger,
    readonly bmdModelNumber: BmdModelNumber,
    readonly workspacePath: string,
    readonly gpioPathPrefix: string = GPIO_PATH_PREFIX
  ) {}

  async openBmd155(): Promise<boolean> {
    await this.logger.log(LogEventId.ConnectToPatInputInit, 'system');

    const possiblePinAddresses = [
      PAT_CONNECTION_STATUS_PIN + PAT_GPIO_OFFSET,
      PAT_CONNECTION_STATUS_PIN,
    ];

    let pinFileHandle: fs.FileHandle | undefined;
    for (const address of possiblePinAddresses) {
      const path = join(this.gpioPathPrefix, `gpio${address}`, 'value');

      const openResult = await fsOpen(path);
      if (openResult.isOk()) {
        pinFileHandle = openResult.ok();
        break;
      }

      if (openResult.isErr()) {
        const openError = openResult.err();
        /* istanbul ignore next */
        if (!openError.message.match('ENOENT')) {
          await this.logger.log(LogEventId.ConnectToGpioPinComplete, 'system', {
            message: `Unexpected error connecting to pin at ${address}: ${openError}`,
            disposition: 'failure',
          });
        }
      }
    }

    if (!pinFileHandle) {
      await this.logger.log(LogEventId.ConnectToPatInputComplete, 'system', {
        message: `PatConnectionStatusReader failed to connect to PAT input. Attempted pins: ${possiblePinAddresses}`,
        disposition: 'failure',
      });
      return false;
    }

    await this.logger.log(LogEventId.ConnectToPatInputComplete, 'system', {
      disposition: 'success',
    });
    this.file = pinFileHandle;
    return true;
  }

  async openBmd150(): Promise<boolean> {
    await this.logger.log(LogEventId.ConnectToPatInputInit, 'system');
    await this.logger.log(LogEventId.ConnectToPatInputComplete, 'system', {
      disposition: 'success',
    });
    const path = join(this.workspacePath, FAI_100_STATUS_FILENAME);
    const openResult = await fsOpen(path);
    if (openResult.isErr()) {
      await this.logger.log(LogEventId.ConnectToPatInputComplete, 'system', {
        message: `Unexpected error trying to open ${path}. Is fai_100_controllerd running?`,
        disposition: 'failure',
      });

      return false;
    }

    this.file = openResult.ok();
    await this.logger.log(LogEventId.ConnectToPatInputComplete, 'system', {
      disposition: 'success',
    });
    return true;
  }

  async open(): Promise<boolean> {
    switch (this.bmdModelNumber) {
      case 'bmd-150':
        return this.openBmd150();
      case 'bmd-155':
        return this.openBmd155();
      // istanbul ignore next - unreachable because BmdModelNumber coverage is exhaustive
      default:
        // istanbul ignore next
        throw new Error(`Unhandled BMD model ${this.bmdModelNumber}`);
    }
  }

  async close(): Promise<void> {
    if (this.file) {
      await this.file.close();
    }
  }

  async isPatDeviceConnected(): Promise<boolean> {
    assert(
      this.file,
      'No FileHandle for PAT connection status pin. Did you call `PatConnectionStatusReader.open()`?'
    );
    // The value file will always contain a single byte (0 or 1)
    const buf = Buffer.alloc(1);
    await this.file.read(buf, 0, 1, 0);

    // We need to convert from raw value to char value
    // ie. raw value 48 for char '0' or raw value 49 for char '1'
    const raw = buf.at(0);
    assert(raw !== undefined);
    const charValue = String.fromCharCode(raw);

    // Contrary to boolean conventions, the value is 0 when a PAT device
    // is connected and 1 when no PAT device is connected
    return charValue === '0';
  }
}
