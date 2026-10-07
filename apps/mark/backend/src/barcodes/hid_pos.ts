const SCANNED_DATA_REPORT_ID = 0x02;
const AIM_ID_PREFIX = ']'.charCodeAt(0);
const AIM_ID_LENGTH = 3;

/**
 * Extracts the barcode payload from a Honeywell CM4680SR HID POS input report:
 *
 *   [0]          report ID (0x02 for scanned data)
 *   [1]          payload length N
 *   [2..4]       AIM symbology ID (e.g. "]Q1" for QR), if enabled
 *   [start..+N)  payload
 *   ...          NUL padding and status bytes
 *
 * Returns `undefined` for non-scan reports and empty payloads. Only
 * single-report payloads are supported.
 */
export function decodeHidPosScanReport(
  report: Uint8Array
): Uint8Array | undefined {
  if (report[0] !== SCANNED_DATA_REPORT_ID) return undefined;

  const length = report[1];
  if (!length) return undefined;

  const dataStart = report[2] === AIM_ID_PREFIX ? 2 + AIM_ID_LENGTH : 2;
  const payload = Uint8Array.from(
    report.subarray(dataStart, dataStart + length)
  );

  return payload.length > 0 ? payload : undefined;
}
