import { afterEach, beforeEach, expect, test } from 'vitest';
import makeDebugger, {
  disable as disableDebugger,
  enable as enableDebugger,
} from 'debug';

import { formatDurationNs, time } from './perf';

const debugLogger = makeDebugger('perf.test');

beforeEach(() => {
  enableDebugger('*');
});

afterEach(() => {
  disableDebugger();
});

test('formatDurationNs as nanoseconds', () => {
  expect(formatDurationNs(BigInt(0))).toEqual('0ns');
  expect(formatDurationNs(BigInt(1))).toEqual('1ns');
  expect(formatDurationNs(BigInt(999))).toEqual('999ns');
});

test('formatDurationNs as microseconds', () => {
  expect(formatDurationNs(BigInt(1000))).toEqual('1µs');
  expect(formatDurationNs(BigInt(1100))).toEqual('1.1µs');
  expect(formatDurationNs(BigInt(9999))).toEqual('9.99µs');
  expect(formatDurationNs(BigInt(123_456))).toEqual('123.45µs');
});

test('formatDurationNs as milliseconds', () => {
  expect(formatDurationNs(BigInt(1_234_567))).toEqual('1.23ms');
  expect(formatDurationNs(BigInt(987_654_321))).toEqual('987.65ms');
});

test('formatDurationNs as seconds', () => {
  expect(formatDurationNs(BigInt(1_234_567_000))).toEqual('1.23s');
});

test('time gets and logs duration in nanoseconds', () => {
  const t = time(debugLogger, 'counting');

  let c = 0;
  for (let i = 0; i < 5_000; i += 1) {
    c += 1;
  }

  expect(c).toEqual(5_000);
  expect(typeof t.checkpoint('checkpoint1')).toEqual('bigint');

  for (let i = 0; i < 5_000; i += 1) {
    c += 1;
  }

  expect(c).toEqual(10_000);
  expect(typeof t.end()).toEqual('bigint');
});
