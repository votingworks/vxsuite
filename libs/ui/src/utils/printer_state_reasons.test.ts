import { describe, expect, test } from 'vitest';
import { parseHighestPriorityIppPrinterStateReason } from './printer_state_reasons.js';

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
