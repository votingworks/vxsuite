import * as fs from 'fs/promises';
import { assert } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { LogEventId, BaseLogger } from '@votingworks/logging';
import { PATH_TO_PAT_CONNECTION_STATUS_PIN } from './constants';

export interface PatConnectionStatusReaderInterface {
  readonly logger: BaseLogger;
  open(): Promise<boolean>;
  close(): Promise<void>;
  isPatDeviceConnected(): Promise<boolean>;
}

export class PatConnectionStatusReader
  implements PatConnectionStatusReaderInterface
{
  private file?: fs.FileHandle;

  constructor(
    // logger prop must be public to be defined in the interface
    // eslint-disable-next-line vx/gts-no-public-class-fields
    readonly logger: BaseLogger,
    private readonly filePath?: string
  ) {
    // We don't use the default initializer syntax because then we'd have to
    // also make filePath a no-op constructor argument in the mock
    if (!filePath) {
      this.filePath = PATH_TO_PAT_CONNECTION_STATUS_PIN;
    }
  }

  async open(): Promise<boolean> {
    assert(this.filePath !== undefined);
    try {
      await fs.access(this.filePath, fs.constants.R_OK);
    } catch (err) {
      await this.logger.log(LogEventId.PatDeviceError, 'system', {
        message: `${this.filePath} is not accessible from VxMarkScan backend. It may be unexported or the backend may be running on development hardware.`,
      });

      return false;
    }

    this.file = await fs.open(this.filePath);
    return true;
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
