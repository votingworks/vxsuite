import { RawPrinterStatus } from './coders';

/**
 * Checks whether the printer status from the driver indicates an error that
 * is not expected during normal operation, such as:
 * - a temperature error if the printer head or motor is too high
 * - a supply voltage error if the voltage is too low
 * - a "receive data error" (not sure what this is)
 * - a generic hardware error, which could indicate a blown fuse, disconnected
 * cable, lack of temperature detection, or some other issue
 *
 * The hardware documentation considers the cover open state to be an error
 * state, but because this is still part of normal operation, we think of
 * it slightly differently.
 */
export function isErrorStatus(status: RawPrinterStatus): boolean {
  return (
    status.hardwareError ||
    status.supplyVoltageError ||
    status.receiveDataError ||
    status.temperatureError
  );
}

/**
 * Sometimes, when the printer has buffered some state after an offline or
 * error event, the next status will be inconsistent, showing that the printer
 * is back online but still has some error state. In this event, we want to retry.
 */
export function isInconsistentStatus(status: RawPrinterStatus): boolean {
  return (
    (isErrorStatus(status) ||
      status.isPaperCoverOpen ||
      status.isPaperAtEnd ||
      status.isBufferFull) &&
    !status.isOffline
  );
}

export function isPrinterStopped(status: RawPrinterStatus): boolean {
  return (
    isErrorStatus(status) || status.isPaperCoverOpen || status.isPaperAtEnd
  );
}
