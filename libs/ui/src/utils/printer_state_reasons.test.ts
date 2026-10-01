import { describe, expect, test } from 'vitest';
import type { PrinterConfig, PrinterStatus } from '@votingworks/types';
import {
  BLOCKING_PRINTER_STATE_REASONS,
  IPP_PRINTER_STATE_REASON_MESSAGES,
  getBlockingPrinterStateReason,
  parseHighestPriorityIppPrinterStateReason,
} from './printer_state_reasons.js';

const MOCK_PRINTER_CONFIG: PrinterConfig = {
  label: '',
  vendorId: 0,
  productId: 0,
  baseDeviceUri: '',
  ppd: '',
  supportsIpp: true,
};

function getMockPrinterStatus(stateReasons: string[] = []): PrinterStatus {
  return {
    connected: true,
    config: MOCK_PRINTER_CONFIG,
    richStatus: { state: 'idle', stateReasons, markerInfos: [] },
  };
}

describe('parseHighestPriorityIppPrinterStateReason', () => {
  test('ignores "none"', () => {
    expect(parseHighestPriorityIppPrinterStateReason(['none'])).toEqual(
      undefined
    );
  });

  test('shows error over warning', () => {
    expect(
      parseHighestPriorityIppPrinterStateReason([
        'toner-low-warning',
        'media-needed-error',
      ])
    ).toEqual('media-needed');
  });

  test('shows warning over report', () => {
    expect(
      parseHighestPriorityIppPrinterStateReason([
        'toner-low-report',
        'media-needed-warning',
      ])
    ).toEqual('media-needed');
  });

  test('shows first of same level', () => {
    expect(
      parseHighestPriorityIppPrinterStateReason([
        'toner-low-warning',
        'media-needed-warning',
      ])
    ).toEqual('toner-low');
  });

  test('ignores unparseable reasons', () => {
    expect(
      parseHighestPriorityIppPrinterStateReason([
        'toner-low-report',
        'media?-what-media?-warning',
      ])
    ).toEqual('toner-low');
  });
});

describe('getBlockingPrinterStateReason', () => {
  test.each([...BLOCKING_PRINTER_STATE_REASONS])('blocks on %s', (reason) => {
    expect(
      getBlockingPrinterStateReason(getMockPrinterStatus([reason]))
    ).toEqual(reason);
  });

  test.each(['-error', '-warning', '-report'])(
    'matches regardless of a %s suffix',
    (suffix) => {
      expect(
        getBlockingPrinterStateReason(
          getMockPrinterStatus([`cover-open${suffix}`])
        )
      ).toEqual('cover-open');
    }
  );

  test.each([
    'toner-low',
    'media-low',
    'marker-supply-low',
    'output-area-almost-full',
    'sleep-mode',
    'none',
  ])('does not block on %s', (reason) => {
    expect(
      getBlockingPrinterStateReason(getMockPrinterStatus([reason]))
    ).toEqual(undefined);
  });

  test('finds a blocking reason ranked below a non-blocking one', () => {
    expect(
      getBlockingPrinterStateReason(
        getMockPrinterStatus(['other-error', 'cover-open-warning'])
      )
    ).toEqual('cover-open');
  });

  test('does not block when there are no reasons', () => {
    expect(getBlockingPrinterStateReason(getMockPrinterStatus())).toEqual(
      undefined
    );
  });

  test('does not block when rich status is unavailable', () => {
    expect(
      getBlockingPrinterStateReason({
        connected: true,
        config: MOCK_PRINTER_CONFIG,
      })
    ).toEqual(undefined);
  });

  test('does not block when the printer is disconnected', () => {
    expect(getBlockingPrinterStateReason({ connected: false })).toEqual(
      undefined
    );
  });

  test('every blocking reason has a message', () => {
    for (const reason of BLOCKING_PRINTER_STATE_REASONS) {
      expect(IPP_PRINTER_STATE_REASON_MESSAGES[reason]).toBeDefined();
    }
  });
});
