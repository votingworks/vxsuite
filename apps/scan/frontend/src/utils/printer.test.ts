import { BROTHER_THERMAL_PRINTER_CONFIG } from '../../test/helpers/fixtures';
import { getPollsFlowPrinterSummary } from './printer';

test('getPollsFlowPrinterSummary', () => {
  expect(
    getPollsFlowPrinterSummary({
      scheme: 'hardware-v3',
      connected: false,
    })
  ).toEqual({ ready: false, alertText: 'Attach printer to continue.' });

  expect(
    getPollsFlowPrinterSummary({
      scheme: 'hardware-v3',
      connected: true,
      config: BROTHER_THERMAL_PRINTER_CONFIG,
    })
  ).toEqual({ ready: true });

  expect(
    getPollsFlowPrinterSummary({
      scheme: 'hardware-v4',
      state: 'idle',
    })
  ).toEqual({ ready: true });

  expect(
    getPollsFlowPrinterSummary({
      scheme: 'hardware-v4',
      state: 'cover-open',
    })
  ).toEqual({
    ready: false,
    alertText: 'The paper roll holder is not attached to the printer',
  });

  expect(
    getPollsFlowPrinterSummary({
      scheme: 'hardware-v4',
      state: 'no-paper',
    })
  ).toEqual({
    ready: false,
    alertText: 'The printer is not loaded with paper',
  });

  expect(
    getPollsFlowPrinterSummary({
      scheme: 'hardware-v4',
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
        scheme: 'hardware-v4',
        state: 'error',
        type,
      })
    ).toEqual({ ready: false, alertText: 'The printer encountered an error' });
  }
});
