import { PaperHandlerStatus } from './coders';

export function isPaperReadyToLoad(
  paperHandlerStatus: PaperHandlerStatus
): boolean {
  return (
    paperHandlerStatus.paperInputLeftInnerSensor &&
    paperHandlerStatus.paperInputLeftOuterSensor &&
    paperHandlerStatus.paperInputRightInnerSensor
    // Ignore the right outer sensor to allow notched paper
  );
}

export function isCoverOpen(paperHandlerStatus: PaperHandlerStatus): boolean {
  const isHoodRaised = paperHandlerStatus.optoSensor;
  const isDeviceOpen = paperHandlerStatus.coverOpen;

  return isHoodRaised || isDeviceOpen;
}

export function isPaperJammed(paperHandlerStatus: PaperHandlerStatus): boolean {
  return paperHandlerStatus.paperJam;
}

export function isPaperInScanner(
  paperHandlerStatus: PaperHandlerStatus
): boolean {
  return (
    paperHandlerStatus.paperPreCisSensor ||
    paperHandlerStatus.paperPostCisSensor ||
    paperHandlerStatus.preHeadSensor ||
    paperHandlerStatus.paperOutSensor ||
    paperHandlerStatus.parkSensor ||
    paperHandlerStatus.scanInProgress
  );
}

export function isPaperInInput(
  paperHandlerStatus: PaperHandlerStatus
): boolean {
  return (
    paperHandlerStatus.paperInputLeftInnerSensor ||
    paperHandlerStatus.paperInputLeftOuterSensor ||
    paperHandlerStatus.paperInputRightInnerSensor ||
    paperHandlerStatus.paperInputRightOuterSensor
  );
}

export function isPaperInOutput(
  paperHandlerStatus: PaperHandlerStatus
): boolean {
  // From experimentation both of these are true when paper is in rear output
  return (
    paperHandlerStatus.ticketPresentInOutput ||
    paperHandlerStatus.paperOutSensor
  );
}

export function isPaperAnywhere(
  paperHandlerStatus: PaperHandlerStatus
): boolean {
  return (
    isPaperInInput(paperHandlerStatus) ||
    isPaperInOutput(paperHandlerStatus) ||
    isPaperInScanner(paperHandlerStatus)
  );
}

export function isPaperParked(paperHandlerStatus: PaperHandlerStatus): boolean {
  return paperHandlerStatus.parkSensor;
}
