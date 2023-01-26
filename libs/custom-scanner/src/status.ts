import { StatusInternalMessage } from './protocol';
import {
  CustomSensorsBitmask,
  JobStatus,
  ScannerA4Status,
  ScannerStatus,
  SensorStatus,
} from './types';

const END_SCAN_VALUE = 'S'.charCodeAt(0);
const PAPER_JAM_VALUE = 'J'.charCodeAt(0);
const SCAN_CANCELED_VALUE = 'C'.charCodeAt(0);
const MOTOR_MOVE_VALUE = 'M'.charCodeAt(0);
const MOTOR_MOVE_SCAN_VALUE = 'S'.charCodeAt(0);

/**
 * Parses the user-friendly status from the internal status the scanner uses over the wire.
 */
export function convertFromInternalStatus(
  internalStatus: StatusInternalMessage
): {
  status: ScannerStatus;
  a4Status: ScannerA4Status;
} {
  const status: ScannerStatus = {
    isDoubleSheet: false,
    isScanCanceled: false,
    isScanInProgress: false,
    isLoadingPaper: false,
    isExternalCoverCloseSensor: false,
    isPrintHeadReady: false,
    isScannerCoverOpen: false,
    isPaperJam: false,
    isJamPaperHeldBack: false,
    isMotorOn: false,
    isTicketOnEnterCenter: false,
    isTicketOnEnterA4: false,
    isTicketLoaded: false,
    isTicketOnExit: false,

    sensorInputCenterLeft: SensorStatus.NoPaper,
    sensorInputCenterRight: SensorStatus.NoPaper,
    sensorInputLeftLeft: SensorStatus.NoPaper,
    sensorInputRightRight: SensorStatus.NoPaper,
    sensorInternalInputLeft: SensorStatus.NoPaper,
    sensorInternalInputRight: SensorStatus.NoPaper,
    sensorOutputCenterLeft: SensorStatus.NoPaper,
    sensorOutputCenterRight: SensorStatus.NoPaper,
    sensorOutputLeftLeft: SensorStatus.NoPaper,
    sensorOutputRightRight: SensorStatus.NoPaper,
    sensorVoidPrintHead: SensorStatus.NoPaper,
  };

  const a4Status: ScannerA4Status = {
    pageCountSideA: 0,
    pageCountSideB: 0,
    pageSizeSideA: 0,
    pageSizeSideB: 0,
    imageWidthSideA: 0,
    imageWidthSideB: 0,
    imageHeightSideA: 0,
    imageHeightSideB: 0,
    endScanSideA: false,
    endScanSideB: false,
  };

  a4Status.pageCountSideA = internalStatus.pageNumSideA;
  a4Status.pageCountSideB = internalStatus.pageNumSideB;
  a4Status.pageSizeSideA = internalStatus.validPageSizeA;
  a4Status.pageSizeSideB = internalStatus.validPageSizeB;
  a4Status.imageWidthSideA = internalStatus.imageWidthA;
  a4Status.imageWidthSideB = internalStatus.imageWidthB;
  a4Status.imageHeightSideA = internalStatus.imageHeightA;
  a4Status.imageHeightSideB = internalStatus.imageHeightB;

  if (internalStatus.endScanA === END_SCAN_VALUE) {
    a4Status.endScanSideA = true;
  }

  if (internalStatus.endScanB === END_SCAN_VALUE) {
    a4Status.endScanSideB = true;
  }

  if (internalStatus.paperJam === PAPER_JAM_VALUE) {
    // Verify which kind of jam
    if (internalStatus.docSensor & CustomSensorsBitmask.ENCODER_ERROR) {
      status.isJamPaperHeldBack = true;
    } else {
      status.isPaperJam = true;
    }
  }

  if (internalStatus.coverOpen) {
    status.isScannerCoverOpen = true;
  }

  if (internalStatus.cancel === SCAN_CANCELED_VALUE) {
    status.isScanCanceled = true;
  }

  if (internalStatus.motorMove === MOTOR_MOVE_VALUE) {
    status.isMotorOn = true;
  }

  if (internalStatus.motorMove === MOTOR_MOVE_SCAN_VALUE) {
    status.isScanInProgress = true;
    status.isMotorOn = true;
  }

  if (internalStatus.jobState & JobStatus.ADF_LOAD_PAPER) {
    status.isLoadingPaper = true;
  }

  if (internalStatus.docSensor & CustomSensorsBitmask.DOUBLE_SHEET) {
    status.isDoubleSheet = true;
  }

  status.sensorInputCenterLeft =
    internalStatus.docSensor & CustomSensorsBitmask.INPUT_CENTER_LEFT
      ? SensorStatus.PaperPresent
      : SensorStatus.NoPaper;

  status.sensorInputCenterRight =
    internalStatus.docSensor & CustomSensorsBitmask.INPUT_CENTER_RIGHT
      ? SensorStatus.PaperPresent
      : SensorStatus.NoPaper;

  status.sensorInputLeftLeft =
    internalStatus.docSensor & CustomSensorsBitmask.INPUT_LEFT_LEFT
      ? SensorStatus.PaperPresent
      : SensorStatus.NoPaper;

  status.sensorInputRightRight =
    internalStatus.docSensor & CustomSensorsBitmask.INPUT_RIGHT_RIGHT
      ? SensorStatus.PaperPresent
      : SensorStatus.NoPaper;

  status.sensorInternalInputLeft =
    internalStatus.docSensor & CustomSensorsBitmask.INTERNAL_LEFT
      ? SensorStatus.PaperPresent
      : SensorStatus.NoPaper;

  status.sensorInternalInputRight =
    internalStatus.docSensor & CustomSensorsBitmask.INTERNAL_RIGHT
      ? SensorStatus.PaperPresent
      : SensorStatus.NoPaper;

  status.sensorOutputCenterLeft =
    internalStatus.docSensor & CustomSensorsBitmask.OUTPUT_CENTER_LEFT
      ? SensorStatus.PaperPresent
      : SensorStatus.NoPaper;

  status.sensorOutputCenterRight =
    internalStatus.docSensor & CustomSensorsBitmask.OUTPUT_CENTER_RIGHT
      ? SensorStatus.PaperPresent
      : SensorStatus.NoPaper;

  status.sensorOutputLeftLeft =
    internalStatus.docSensor & CustomSensorsBitmask.OUTPUT_LEFT_LEFT
      ? SensorStatus.PaperPresent
      : SensorStatus.NoPaper;

  status.sensorOutputRightRight =
    internalStatus.docSensor & CustomSensorsBitmask.OUTPUT_RIGHT_RIGHT
      ? SensorStatus.PaperPresent
      : SensorStatus.NoPaper;

  status.isTicketOnEnterCenter =
    status.sensorInputCenterLeft === SensorStatus.PaperPresent &&
    status.sensorInputCenterRight === SensorStatus.PaperPresent;

  status.isTicketOnEnterA4 =
    status.sensorInputLeftLeft === SensorStatus.PaperPresent &&
    status.sensorInputCenterLeft === SensorStatus.PaperPresent &&
    status.sensorInputCenterRight === SensorStatus.PaperPresent &&
    status.sensorInputRightRight === SensorStatus.PaperPresent;

  status.isTicketLoaded =
    status.sensorInternalInputLeft === SensorStatus.PaperPresent &&
    status.sensorInternalInputRight === SensorStatus.PaperPresent &&
    status.sensorOutputCenterLeft === SensorStatus.PaperPresent &&
    status.sensorOutputCenterRight === SensorStatus.PaperPresent;

  status.isTicketOnExit =
    status.sensorOutputLeftLeft === SensorStatus.PaperPresent &&
    status.sensorOutputRightRight === SensorStatus.PaperPresent;

  return { status, a4Status };
}
