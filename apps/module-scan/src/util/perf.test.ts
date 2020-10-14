import { formatDurationNs, time } from './perf'

test('formatDurationNs as nanoseconds', () => {
  expect(formatDurationNs(BigInt(0))).toEqual('0ns')
  expect(formatDurationNs(BigInt(1))).toEqual('1ns')
  expect(formatDurationNs(BigInt(999))).toEqual('999ns')
})

test('formatDurationNs as microseconds', () => {
  expect(formatDurationNs(BigInt(1000))).toEqual('1µs')
  expect(formatDurationNs(BigInt(1100))).toEqual('1.1µs')
  expect(formatDurationNs(BigInt(9999))).toEqual('9.99µs')
  expect(formatDurationNs(BigInt(123_456))).toEqual('123.45µs')
})

test('formatDuationNs as milliseconds', () => {
  expect(formatDurationNs(BigInt(1_234_567))).toEqual('1.23ms')
  expect(formatDurationNs(BigInt(987_654_321))).toEqual('987.65ms')
})

test('formatDuationNs as seconds', () => {
  expect(formatDurationNs(BigInt(1_234_567_000))).toEqual('1.23s')
})

test('time gets and logs duration in nanoseconds', () => {
  const t = time('counting')

  let c = 0
  for (let i = 0; i < 10_000; i++) {
    c++
  }

  expect(c).toEqual(10_000)
  expect(typeof t.end()).toEqual('bigint')
})
