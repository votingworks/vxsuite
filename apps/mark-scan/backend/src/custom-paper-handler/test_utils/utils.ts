import {
  DEFAULT_PAPER_HANDLER_STATUS,
  PaperHandlerStatus,
} from '@votingworks/custom-paper-handler';

export function getDefaultPaperHandlerStatus(): PaperHandlerStatus {
  return { ...DEFAULT_PAPER_HANDLER_STATUS };
}

export function getPaperParkedStatus(): PaperHandlerStatus {
  return { ...DEFAULT_PAPER_HANDLER_STATUS, parkSensor: true };
}

export function getPaperInsideStatus(): PaperHandlerStatus {
  return { ...DEFAULT_PAPER_HANDLER_STATUS, paperPreCisSensor: true };
}

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

export function getPaperJammedStatus(): PaperHandlerStatus {
  return {
    ...DEFAULT_PAPER_HANDLER_STATUS,
    ...getPaperInFrontStatus(),
    paperJam: true,
  };
}

export function getJammedButNoPaperStatus(): PaperHandlerStatus {
  return {
    ...DEFAULT_PAPER_HANDLER_STATUS,
    paperJam: true,
  };
}
