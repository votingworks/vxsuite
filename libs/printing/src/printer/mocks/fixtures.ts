import {
  IppMarkerInfo,
  PrinterConfig,
  PrinterRichStatus,
  PrinterStatus,
} from '@votingworks/types';

export const MOCK_MARKER_INFO: IppMarkerInfo = {
  color: '#000000',
  highLevel: 100,
  level: 100,
  lowLevel: 2,
  name: 'black cartridge',
  type: 'toner-cartridge',
};

export const MOCK_PRINTER_RICH_STATUS: PrinterRichStatus = {
  state: 'idle',
  stateReasons: [],
  markerInfos: [MOCK_MARKER_INFO],
};

export function getMockConnectedPrinterStatus(
  config: PrinterConfig
): PrinterStatus {
  if (config.supportsIpp) {
    return {
      connected: true,
      config,
      richStatus: MOCK_PRINTER_RICH_STATUS,
    };
  }

  return {
    connected: true,
    config,
  };
}
