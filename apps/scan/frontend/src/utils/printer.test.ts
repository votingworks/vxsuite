import { expect, test } from 'vitest';
import { getPollsFlowPrinterSummary } from './printer';

test('getPollsFlowPrinterSummary', () => {
  expect(
    getPollsFlowPrinterSummary({
      state: 'idle',
    })
  ).toEqual({ ready: true });

  expect(
    getPollsFlowPrinterSummary({
      state: 'cover-open',
    })
  ).toEqual({
    ready: false,
    alertText: 'The paper roll holder is not attached to the printer',
  });

  expect(
    getPollsFlowPrinterSummary({
      state: 'no-paper',
    })
  ).toEqual({
    ready: false,
    alertText: 'The printer is not loaded with paper',
  });

  expect(
    getPollsFlowPrinterSummary({
      state: 'error',
      type: 'disconnected',
    })
  ).toEqual({ ready: false, alertText: 'The printer is disconnected' });

  const errorTypes = [
    'temperature',
    'supply-voltage',
    'receive-data',
    'hardware',
  ] as const;
  for (const type of errorTypes) {
    expect(
      getPollsFlowPrinterSummary({
        state: 'error',
        type,
      })
    ).toEqual({ ready: false, alertText: 'The printer encountered an error' });
  }
});
