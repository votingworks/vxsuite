// Honeywell CM4680SR "HID POS" (USB HID Point of Sale) input report parsing.

/** Report id the scanner uses for decoded barcode data. */
const SCANNED_DATA_REPORT_ID = 0x02;
/** AIM symbology ids are transmitted as ']' followed by two characters. */
const AIM_ID_PREFIX = ']'.charCodeAt(0);
const AIM_ID_LENGTH = 3;

/**
 * Extracts the decoded barcode payload from a Honeywell CM4680SR HID POS input
 * report. The report layout is:
 *
 *   [0]          report id (0x02 for scanned data)
 *   [1]          payload length N
 *   [2..4]       AIM symbology id (e.g. "]Q1" for QR), when transmitted
 *   [start..N)   the N payload bytes
 *   ...          NUL padding + trailing status bytes
 *
 * Returns `undefined` for non-scan reports (e.g. terminator/status reports) or
 * an empty payload.
 *
 * [TODO] A HID report is 64 bytes, so payloads longer than a single report
 * arrive split across multiple reports. This handles only single-report scans,
 * which is sufficient for ballot-activation payloads.
 */
export function decodeHidPosScanReport(
  report: Uint8Array
): Uint8Array | undefined {
  if (report[0] !== SCANNED_DATA_REPORT_ID) return undefined;

  const length = report[1];
  if (!length) return undefined;

  // The AIM symbology id is present unless the scanner is configured to omit it.
  const dataStart = report[2] === AIM_ID_PREFIX ? 2 + AIM_ID_LENGTH : 2;
  // Copy exactly `length` bytes into a fresh array (dropping the AIM id, NUL
  // padding, and trailing status), owning its buffer so it can be transferred.
  const payload = Uint8Array.from(
    report.subarray(dataStart, dataStart + length)
  );

  return payload.length > 0 ? payload : undefined;
}
