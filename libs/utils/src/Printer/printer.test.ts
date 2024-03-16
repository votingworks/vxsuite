import { fakeKiosk } from '@votingworks/test-utils';
import { describe, expect, it, mock, test } from 'bun:test';
import { LocalPrinter, NullPrinter, getPrinter } from '.';

test('`getPrinter` makes a kiosk printer if kiosk printing is available', async () => {
  try {
    window.kiosk = fakeKiosk();
    await getPrinter().print({ sides: 'one-sided' });
    expect(window.kiosk.print).toHaveBeenCalledTimes(1);
  } finally {
    window.kiosk = undefined;
  }
});

test('`getPrinter` makes a `LocalPrinter` if kiosk printing is unavailable', () => {
  expect(getPrinter()).toBeInstanceOf(LocalPrinter);
});

describe('a local printer', () => {
  it('calls `window.print` when printing', async () => {
    const printMock = mock();
    Object.defineProperty(window, 'print', {
      value: printMock,
      configurable: true,
    });
    printMock.mockReturnValueOnce(undefined);
    await new LocalPrinter().print({ sides: 'one-sided' });
    expect(window.print).toHaveBeenCalled();
  });
});

describe('a null printer', () => {
  it('does not print to `window.print`', async () => {
    const printMock = mock();
    Object.defineProperty(window, 'print', {
      value: printMock,
      configurable: true,
    });
    printMock.mockReturnValueOnce(undefined);
    await new NullPrinter().print();
    expect(window.print).not.toHaveBeenCalled();
  });
});
