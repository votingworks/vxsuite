import { expect, test } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import { decodeHidPosScanReport } from './hid_pos';

const REPORT_ID = 0x02;
const AIM_QR = [']'.charCodeAt(0), 'Q'.charCodeAt(0), '1'.charCodeAt(0)];

function decodeToString(report: Uint8Array): string | undefined {
  const payload = decodeHidPosScanReport(report);
  return payload && new TextDecoder().decode(payload);
}

test('extracts the payload from a framed HID POS report, dropping AIM id and padding', () => {
  const json = '{"bsId":"1_en","pId":"xkd0mbksmae2"}';
  const jsonBytes = new TextEncoder().encode(json);
  const report = Uint8Array.from([
    REPORT_ID,
    jsonBytes.length,
    ...AIM_QR,
    ...jsonBytes,
    // trailing NUL padding + status bytes the scanner appends
    0,
    0,
    0,
    0,
    's'.charCodeAt(0),
    '1'.charCodeAt(0),
    0,
  ]);

  expect(decodeToString(report)).toEqual(json);
});

test('handles a report with no AIM symbology id', () => {
  const text = 'hello';
  const textBytes = new TextEncoder().encode(text);
  const report = Uint8Array.from([
    REPORT_ID,
    textBytes.length,
    ...textBytes,
    0,
    0,
  ]);

  expect(decodeToString(report)).toEqual(text);
});

test('ignores non-scan reports', () => {
  // e.g. a carriage-return / terminator report with a different report id.
  expect(
    decodeHidPosScanReport(Uint8Array.from([0x0d, 0x01, 0x41]))
  ).toBeUndefined();
});

test('ignores reports with an empty payload', () => {
  // Length byte is zero.
  expect(
    decodeHidPosScanReport(Uint8Array.from([REPORT_ID, 0]))
  ).toBeUndefined();
  // Non-zero length byte but no actual data bytes present.
  expect(
    decodeHidPosScanReport(Uint8Array.from([REPORT_ID, 5]))
  ).toBeUndefined();
});

test('returns an independent buffer that can be transferred', () => {
  const report = Uint8Array.from([REPORT_ID, 2, ...AIM_QR, 0x41, 0x42, 0, 0]);
  const payload = assertDefined(decodeHidPosScanReport(report));
  expect(payload.byteOffset).toEqual(0);
  expect(payload.buffer.byteLength).toEqual(payload.length);
});
