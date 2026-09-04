import {
  IppMarkerInfo,
  PrinterConfig,
  PrinterRichStatus,
  PrinterStatus,
  PrintJobId,
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

/**
 * Mock printers have no CUPS queue to assign job ids, so they mint their own.
 * Ids are unique within a process, which is all any caller relies on.
 */
let nextMockJobId = 1;

export function createMockJobId(): PrintJobId {
  const jobId = nextMockJobId;
  nextMockJobId += 1;
  return jobId;
}
