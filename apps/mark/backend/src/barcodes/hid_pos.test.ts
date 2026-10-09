import { expect, test } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import { decodeHidPosScanReport } from './hid_pos.js';

const REPORT_ID = 0x02;
const AIM_QR = [']'.charCodeAt(0), 'Q'.charCodeAt(0), '1'.charCodeAt(0)];

function decodeToString(report: Uint8Array): string | undefined {
  const payload = decodeHidPosScanReport(report);
  return payload && new TextDecoder().decode(payload);
}

test('extracts the payload, dropping the AIM ID, padding, and status bytes', () => {
  const json = '{"ballotStyleId":"1_en","precinctId":"xkd0mbksmae2"}';
  const jsonBytes = new TextEncoder().encode(json);
  const report = Uint8Array.from([
    REPORT_ID,
    jsonBytes.length,
    ...AIM_QR,
    ...jsonBytes,
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

test('extracts the payload from a report without an AIM ID', () => {
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
  expect(
    decodeHidPosScanReport(Uint8Array.from([0x0d, 0x01, 0x41]))
  ).toBeUndefined();
});

test('ignores reports with an empty payload', () => {
  expect(
    decodeHidPosScanReport(Uint8Array.from([REPORT_ID, 0]))
  ).toBeUndefined();
  expect(
    decodeHidPosScanReport(Uint8Array.from([REPORT_ID, 5]))
  ).toBeUndefined();
});

test('returns a payload that owns its buffer', () => {
  const report = Uint8Array.from([REPORT_ID, 2, ...AIM_QR, 0x41, 0x42, 0, 0]);
  const payload = assertDefined(decodeHidPosScanReport(report));
  expect(payload.byteOffset).toEqual(0);
  expect(payload.buffer.byteLength).toEqual(payload.length);
});
