import {
  DEFAULT_PAPER_HANDLER_STATUS,
  PaperHandlerStatus,
} from '@votingworks/custom-paper-handler';

export function getDefaultPaperHandlerStatus(): PaperHandlerStatus {
  return { ...DEFAULT_PAPER_HANDLER_STATUS };
}

// @coverage-defer
export function getPaperParkedStatus(): PaperHandlerStatus {
  return { ...DEFAULT_PAPER_HANDLER_STATUS, parkSensor: true };
}

// @coverage-defer
export function getPaperInsideStatus(): PaperHandlerStatus {
  return { ...DEFAULT_PAPER_HANDLER_STATUS, paperPreCisSensor: true };
}

// @coverage-defer
export function getPaperInFrontStatus(): PaperHandlerStatus {
  return {
    ...DEFAULT_PAPER_HANDLER_STATUS,
    paperInputLeftInnerSensor: true,
    paperInputLeftOuterSensor: true,
    paperInputRightInnerSensor: true,
    paperInputRightOuterSensor: true,
  };
}

export function getPaperInRearStatus(): PaperHandlerStatus {
  return {
    ...DEFAULT_PAPER_HANDLER_STATUS,
    ticketPresentInOutput: true,
    paperOutSensor: true,
  };
}

// @coverage-defer
export function getPaperJammedStatus(): PaperHandlerStatus {
  return {
    ...DEFAULT_PAPER_HANDLER_STATUS,
    ...getPaperInFrontStatus(),
    paperJam: true,
  };
}

// @coverage-defer
export function getJammedButNoPaperStatus(): PaperHandlerStatus {
  return {
    ...DEFAULT_PAPER_HANDLER_STATUS,
    paperJam: true,
  };
}
