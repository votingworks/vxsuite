/** `CTYPE_*` values from the vendor's `ino.hpp`, as carried in a `control` event's `controlType`. */
export const ControlType = {
  Error: 1,
  Status: 20,
  Feeder: 30,
  ScanErrorUnknown: 600,
  ScanErrorInterlock: 601,
  ScanErrorPaperInside: 602,
  ScanErrorPaperJam: 603,
  ScanErrorDoubleFeed: 604,
} as const;

/** A {@link ControlType.Status} event's `numData`, as observed from the scanner. */
export const ScannerState = {
  Offline: 0,
  Ready: 1,
  NotReady: 2,
  Scanning: 4,
} as const;

/** `ImageHeader.scanSide` values. */
export const ScanSide = {
  Front: 0,
  Back: 1,
} as const;
