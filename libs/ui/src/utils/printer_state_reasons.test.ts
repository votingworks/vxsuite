import { describe, expect, test } from 'vitest';
import type {
  IppMarkerInfo,
  PrinterConfig,
  PrinterStatus,
} from '@votingworks/types';
import {
  BLOCKING_PRINTER_STATE_REASONS,
  IPP_PRINTER_STATE_REASON_MESSAGES,
  LOW_TONER_LEVEL,
  getBlockingPrinterStateReason,
  isPrinterTonerLow,
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

function getMockPrinterStatus(
  stateReasons: string[] = [],
  markerInfos: IppMarkerInfo[] = []
): PrinterStatus {
  return {
    connected: true,
    config: MOCK_PRINTER_CONFIG,
    richStatus: { state: 'idle', stateReasons, markerInfos },
  };
}

function getMockMarkerInfo(
  overrides: Partial<IppMarkerInfo> = {}
): IppMarkerInfo {
  return {
    name: 'black cartridge',
    color: '#000000',
    type: 'toner-cartridge',
    lowLevel: 2,
    highLevel: 100,
    level: 100,
    ...overrides,
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

describe('isPrinterTonerLow', () => {
  test('is low at or below the low toner level', () => {
    expect(
      isPrinterTonerLow(
        getMockPrinterStatus(
          [],
          [getMockMarkerInfo({ level: LOW_TONER_LEVEL })]
        )
      )
    ).toEqual(true);
  });

  test('is not low above the low toner level', () => {
    expect(
      isPrinterTonerLow(
        getMockPrinterStatus(
          [],
          [getMockMarkerInfo({ level: LOW_TONER_LEVEL + 1 })]
        )
      )
    ).toEqual(false);
  });

  test('is low at 0', () => {
    expect(
      isPrinterTonerLow(
        getMockPrinterStatus([], [getMockMarkerInfo({ level: 0 })])
      )
    ).toEqual(true);
  });

  test('is not low when the level is unavailable or unknown', () => {
    for (const level of [-1, -2, -3]) {
      expect(
        isPrinterTonerLow(
          getMockPrinterStatus([], [getMockMarkerInfo({ level })])
        )
      ).toEqual(false);
    }
  });

  test('ignores markers other than the black toner cartridge', () => {
    expect(
      isPrinterTonerLow(
        getMockPrinterStatus(
          [],
          [
            getMockMarkerInfo({ name: 'cyan cartridge', level: 0 }),
            getMockMarkerInfo({ type: 'waste-toner', level: 0 }),
          ]
        )
      )
    ).toEqual(false);
  });

  test('is low when the printer reports low toner', () => {
    expect(
      isPrinterTonerLow(getMockPrinterStatus(['toner-low-warning']))
    ).toEqual(true);
    expect(
      isPrinterTonerLow(getMockPrinterStatus(['marker-supply-low-report']))
    ).toEqual(true);
  });

  test('is not low for other reasons', () => {
    expect(
      isPrinterTonerLow(getMockPrinterStatus(['media-low-warning']))
    ).toEqual(false);
  });

  test('is not low without rich status', () => {
    expect(
      isPrinterTonerLow({ connected: true, config: MOCK_PRINTER_CONFIG })
    ).toEqual(false);
    expect(isPrinterTonerLow({ connected: false })).toEqual(false);
  });
});
