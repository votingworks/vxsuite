// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace jest {
  interface Matchers<R> {
    toEqualBits(buffer: Uint8Array): R
  }
}

function asBinaryString(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((n) => n.toString(2).padStart(8, '0'))
    .join('')
}

expect.extend({
  toEqualBits(
    received: Uint8Array,
    expected: Uint8Array
  ): jest.CustomMatcherResult {
    return {
      pass: this.equals(received, expected),
      message: (): string =>
        this.utils.diff(asBinaryString(received), asBinaryString(expected)) ||
        '',
    }
  },
})
