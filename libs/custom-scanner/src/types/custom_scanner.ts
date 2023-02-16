import { Result } from '@votingworks/basics';
import { SheetOf } from '@votingworks/types';
import {
  ErrorCode,
  FormMovement,
  ImageFromScanner,
  ReleaseType,
  ScannerStatus,
  ScanParameters,
} from '../types';
import { StatusInternalMessage } from '../protocol';

/**
 * Interface for a Custom scanner.
 */
export interface CustomScanner {
  /**
   * Connects to the scanner and prepares to send commands. You must call
   * {@link disconnect} when you are done with the scanner.
   */
  connect(): Promise<Result<void, ErrorCode>>;

  /**
   * Disconnects from the scanner after waiting for any pending operations to
   * complete.
   */
  disconnect(): Promise<void>;

  /**
   * Gets the release version of the channel for a specific type of release.
   */
  getReleaseVersion(
    releaseType: ReleaseType
  ): Promise<Result<string, ErrorCode>>;

  /**
   * Gets information about the scanner's current status.
   */
  getStatus(): Promise<Result<ScannerStatus, ErrorCode>>;

  /**
   * Gets the low-level status information from the scanner.
   */
  getStatusRaw(): Promise<Result<StatusInternalMessage, ErrorCode>>;

  /**
   * Moves a sheet of paper as directed.
   */
  move(movement: FormMovement): Promise<Result<void, ErrorCode>>;

  /**
   * Scans a sheet of paper and returns the resulting images. Note that this
   * method will always return a pair of `ImageFromScanner` objects, even if the
   * scanner only scanned one side of the paper. The image buffer for the side
   * that was not scanned will be empty.
   */
  scan(
    scanParameters: ScanParameters,
    options?: { maxTimeoutNoMoveNoScan?: number; maxRetries?: number }
  ): Promise<Result<SheetOf<ImageFromScanner>, ErrorCode>>;

  /**
   * Resets the hardware.
   */
  resetHardware(): Promise<Result<void, ErrorCode>>;
}
