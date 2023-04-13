/* istanbul ignore file - mock */
import { ok } from '@votingworks/basics';
import { ScannerStatus, SensorStatus } from '../types';
import { CustomScanner } from '../types/custom_scanner';

/**
 * Mock ScannerStatus object for when the custom scanner has no paper and nothing is happening.
 */
export const MOCK_NO_PAPER: ScannerStatus = {
  sensorInputRightRight: SensorStatus.NoPaper,
  sensorInputCenterRight: SensorStatus.NoPaper,
  sensorInputCenterLeft: SensorStatus.NoPaper,
  sensorInputLeftLeft: SensorStatus.NoPaper,
  sensorInternalInputLeft: SensorStatus.NoPaper,
  sensorInternalInputRight: SensorStatus.NoPaper,
  sensorOutputRightRight: SensorStatus.NoPaper,
  sensorOutputCenterRight: SensorStatus.NoPaper,
  sensorOutputCenterLeft: SensorStatus.NoPaper,
  sensorOutputLeftLeft: SensorStatus.NoPaper,
  sensorVoidPrintHead: SensorStatus.NoPaper,
  isDoubleSheet: false,
  isScanCanceled: false,
  isScanInProgress: false,
  isLoadingPaper: false,
  isScannerCoverOpen: false,
  isPaperJam: false,
  isJamPaperHeldBack: false,
  isMotorOn: false,
  isTicketOnEnterCenter: false,
  isTicketOnEnterA4: false,
  isTicketLoaded: false,
  isTicketOnExit: false,
  isPrintHeadReady: false,
  isExternalCoverCloseSensor: false,
};

/**
 * Mock ScannerStatus object for when the custom scanner is ready to scan.
 */
export const MOCK_READY_TO_SCAN: ScannerStatus = {
  ...MOCK_NO_PAPER,
  sensorInputLeftLeft: SensorStatus.PaperPresent,
  sensorInputCenterLeft: SensorStatus.PaperPresent,
  sensorInputCenterRight: SensorStatus.PaperPresent,
  sensorInputRightRight: SensorStatus.PaperPresent,
};

/**
 * Mock ScannerStatus object for when the custom scanner is ready to eject.
 */
export const MOCK_READY_TO_EJECT: ScannerStatus = {
  ...MOCK_NO_PAPER,
  sensorOutputLeftLeft: SensorStatus.PaperPresent,
  sensorOutputCenterLeft: SensorStatus.PaperPresent,
  sensorOutputCenterRight: SensorStatus.PaperPresent,
  sensorOutputRightRight: SensorStatus.PaperPresent,
};

/**
 * Mock ScannerStatus object for when the custom scanner is experiencing a jam.
 */
export const MOCK_INTERNAL_JAM: ScannerStatus = {
  ...MOCK_NO_PAPER,
  sensorOutputLeftLeft: SensorStatus.PaperPresent,
  sensorOutputCenterLeft: SensorStatus.PaperPresent,
  sensorOutputCenterRight: SensorStatus.PaperPresent,
  sensorOutputRightRight: SensorStatus.PaperPresent,
  isPaperJam: true,
};

/**
 * Mock ScannerStatus object for when the custom scanner is experiencing a double sheet situation.
 */
export const MOCK_DOUBLE_SHEET: ScannerStatus = {
  ...MOCK_NO_PAPER,
  sensorOutputLeftLeft: SensorStatus.PaperPresent,
  sensorOutputCenterLeft: SensorStatus.PaperPresent,
  sensorOutputCenterRight: SensorStatus.PaperPresent,
  sensorOutputRightRight: SensorStatus.PaperPresent,
  isPaperJam: true,
  isDoubleSheet: true,
};

/**
 * Mock ScannerStatus object for when the custom scanner is sees paper on both sides.
 */
export const MOCK_BOTH_SIDES_HAVE_PAPER: ScannerStatus = {
  ...MOCK_NO_PAPER,
  sensorOutputLeftLeft: SensorStatus.PaperPresent,
  sensorOutputCenterLeft: SensorStatus.PaperPresent,
  sensorOutputCenterRight: SensorStatus.PaperPresent,
  sensorOutputRightRight: SensorStatus.PaperPresent,
  sensorInputLeftLeft: SensorStatus.PaperPresent,
  sensorInputCenterLeft: SensorStatus.PaperPresent,
  sensorInputCenterRight: SensorStatus.PaperPresent,
  sensorInputRightRight: SensorStatus.PaperPresent,
};

/**
 * Mock ScannerStatus object for when the custom scanner thinks there is a jam but the paper has been cleared.
 */
export const MOCK_JAM_CLEARED: ScannerStatus = {
  ...MOCK_NO_PAPER,
  isPaperJam: true,
};

/**
 * Mock ScannerStatus object for when the custom scanner thinks there is a jam but the paper has been cleared.
 */
export const MOCK_DOUBLE_SHEET_CLEARED: ScannerStatus = {
  ...MOCK_NO_PAPER,
  isPaperJam: true,
  isDoubleSheet: true,
};

/**
 * Builds a `Custom Scanner` instance with mock methods.
 */
export function fakeCustomScanner(): jest.Mocked<CustomScanner> {
  return {
    getReleaseVersion: jest.fn(),
    getStatus: jest.fn().mockResolvedValue(ok(MOCK_NO_PAPER)),
    resetHardware: jest.fn().mockResolvedValue(ok()),
    connect: jest.fn().mockResolvedValue(ok()),
    disconnect: jest.fn().mockResolvedValue(ok()),
    move: jest.fn().mockResolvedValue(ok()),
    getStatusRaw: jest.fn().mockResolvedValue(ok()),
    scan: jest.fn().mockResolvedValue(ok()),
  };
}
