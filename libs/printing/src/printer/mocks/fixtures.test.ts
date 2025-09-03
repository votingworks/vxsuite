import { expect, test } from 'vitest';
import { CITIZEN_THERMAL_PRINTER_CONFIG, HP_LASER_PRINTER_CONFIG } from '..';
import {
  MOCK_PRINTER_RICH_STATUS,
  getMockConnectedPrinterStatus,
} from './fixtures';

test('getMockConnectedPrinterStatus', () => {
  expect(getMockConnectedPrinterStatus(HP_LASER_PRINTER_CONFIG)).toEqual({
    connected: true,
    config: HP_LASER_PRINTER_CONFIG,
    richStatus: MOCK_PRINTER_RICH_STATUS,
  });

  expect(getMockConnectedPrinterStatus(CITIZEN_THERMAL_PRINTER_CONFIG)).toEqual(
    {
      connected: true,
      config: CITIZEN_THERMAL_PRINTER_CONFIG,
    }
  );
});
