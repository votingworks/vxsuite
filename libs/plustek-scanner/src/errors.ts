import { safeParse } from '@votingworks/types';
import * as z from 'zod';

/**
 * All possible error codes returned by the plustek drivers.
 */
export enum ScannerError {
  /* VTM STATUS */
  VtmScanOvertime = 'PLKSS_ERRCODE_VTM_SCAN_OVERTIME',
  VtmGratingSensorNotMove = 'PLKSS_ERRCODE_VTM_GRATING_SENSOR_NOT_MOVE',
  VtmNoDevicesAfterEject = 'PLKSS_ERRCODE_VTM_NO_DEVICES_AFTER_EJECT',
  VtmBothSideHavePaper = 'PLKSS_ERRCODE_VTM_BOTH_SIDE_HAVE_PAPER',
  /* CallBack STATUS */
  CbStatusIlReadImageFail = 'PLKSS_ERRCODE_CB_STATUS_IL_READ_IMAGE_FAIL',
  CbStatusIlAutoDeskewExFail = 'PLKSS_ERRCODE_CB_STATUS_IL_AUTO_DESKEW_EX_FAIL',
  CbStatusIlAutoCropFail = 'PLKSS_ERRCODE_CB_STATUS_IL_AUTO_CROP_FAIL',
  CbStatusIlPunchHoleRemovalFail = 'PLKSS_ERRCODE_CB_STATUS_IL_PUNCH_HOLE_REMOVAL_FAIL',
  CbStatusIlRemoveBlankPageFail = 'PLKSS_ERRCODE_CB_STATUS_IL_REMOVE_BLANK_PAGE_FAIL',
  CbStatusIlApplyContrastFail = 'PLKSS_ERRCODE_CB_STATUS_IL_APPLY_CONTRAST_FAIL',
  CbStatusIlApplyGammaFail = 'PLKSS_ERRCODE_CB_STATUS_IL_APPLY_GAMMA_FAIL',
  CbStatusIlApplyBrightnessFail = 'PLKSS_ERRCODE_CB_STATUS_IL_APPLY_BRIGHTNESS_FAIL',
  CbStatusIlReduceBorderFail = 'PLKSS_ERRCODE_CB_STATUS_IL_REDUCE_BORDER_FAIL',
  CbStatusIlAutoDensityFail = 'PLKSS_ERRCODE_CB_STATUS_IL_AUTO_DENSITY_FAIL',
  CbStatusIlAutoEnhanceFail = 'PLKSS_ERRCODE_CB_STATUS_IL_AUTO_ENHANCE_FAIL',
  CbStatusIlRemoveBackgroundFail = 'PLKSS_ERRCODE_CB_STATUS_IL_REMOVE_BACKGROUND_FAIL',
  CbStatusIlCharacterEnhancementFail = 'PLKSS_ERRCODE_CB_STATUS_IL_CHARACTER_ENHANCEMENT_FAIL',
  CbStatusIlConvertFail = 'PLKSS_ERRCODE_CB_STATUS_IL_CONVERT_FAIL',
  CbStatusIlSaveFail = 'PLKSS_ERRCODE_CB_STATUS_IL_SAVE_FAIL',
  CbStatusIlResizeFail = 'PLKSS_ERRCODE_CB_STATUS_IL_RESIZE_FAIL',
  CbStatusIlRotateFail = 'PLKSS_ERRCODE_CB_STATUS_IL_ROTATE_FAIL',
  CbStatusMergeFail = 'PLKSS_ERRCODE_CB_STATUS_MERGE_FAIL',
  CbStatusMergeOutOfMemory = 'PLKSS_ERRCODE_CB_STATUS_MERGE_OUT_OF_MEMORY',
  CbStatusMergeFileNotExist = 'PLKSS_ERRCODE_CB_STATUS_MERGE_FILE_NOT_EXIST',
  CbStatusIlApplyHistogramFail = 'PLKSS_ERRCODE_CB_STATUS_IL_APPLY_HISTOGRAM_FAIL',
  CbStatusIlResizeByResolutionFail = 'PLKSS_ERRCODE_CB_STATUS_IL_RESIZE_BY_RESOLUTION_FAIL',
  CbStatusIlApplySharpenFail = 'PLKSS_ERRCODE_CB_STATUS_IL_APPLY_SHARPEN_FAIL',
  CbStatusIlAutoRotateInterfaceFail = 'PLKSS_ERRCODE_CB_STATUS_IL_AUTO_ROTATE_INTERFACE_FAIL',
  /* PAPER STATUS */
  PaperStatusNoPaper = 'PLKSS_ERRCODE_PAPER_STATUS_NO_PAPER',
  PaperStatusOnDocumentTray = 'PLKSS_ERRCODE_PAPER_STATUS_ON_DOCUMENT_TRAY',
  PaperStatusLoading = 'PLKSS_ERRCODE_PAPER_STATUS_LOADING',
  PaperStatusEjecting = 'PLKSS_ERRCODE_PAPER_STATUS_EJECTING',
  PaperStatusJam = 'PLKSS_ERRCODE_PAPER_STATUS_JAM',
  PaperStatusErrorFeeding = 'PLKSS_ERRCODE_PAPER_STATUS_ERROR_FEEDING',
  PaperStatusCoverOpened = 'PLKSS_ERRCODE_PAPER_STATUS_COVER_OPENED',
  PaperStatusScanning = 'PLKSS_ERRCODE_PAPER_STATUS_SCANNING',
  PaperStatusMultifeed = 'PLKSS_ERRCODE_PAPER_STATUS_MULTIFEED',
  PaperStatusXferCondition = 'PLKSS_ERRCODE_PAPER_STATUS_XFER_CONDITION',
  /* SDK Function Return Code */
  Fail = /** < The function is failed */ 'PLKSS_ERRCODE_FAIL',
  NoInit = /** < Not do INIT */ 'PLKSS_ERRCODE_NO_INIT',
  NotYetOpenDevice = /** < Not do OPEN_DEVICE */ 'PLKSS_ERRCODE_NOT_YET_OPEN_DEVICE',
  DeviceAlreadyOpen = /** < The device has opened by OPEN_DEVICE */ 'PLKSS_ERRCODE_DEVICE_ALREADY_OPEN',
  InvalidSource = /** < Input invalid source */ 'PLKSS_ERRCODE_INVALID_SOURCE',
  OnlySupportColorMode = /** < Only support color mode */ 'PLKSS_ERRCODE_ONLY_SUPPORT_COLOR_MODE',
  NoSupportEject = /** < No support eject direction control */ 'PLKSS_ERRCODE_NO_SUPPORT_EJECT',
  PaperNotReady = /** < No paper */ 'PLKSS_ERRCODE_PAPER_NOT_READY',
  InvalidSerialnum = /** < The Serial number is invalid */ 'PLKSS_ERRCODE_INVALID_SERIALNUM',
  FormatNotSupport = /** < The format is not supported */ 'PLKSS_ERRCODE_FORMAT_NOT_SUPPORT',
  NoCalibrationData = /** < Not yet calibration */ 'PLKSS_ERRCODE_NO_CALIBRATION_DATA',
  NoDevices = 'PLKSS_ERRCODE_NO_DEVICES',
  NoDeviceName = 'PLKSS_ERRCODE_NO_DEVICE_NAME',
  NoSource = 'PLKSS_ERRCODE_NO_SOURCE',
  FileNoExist = 'PLKSS_ERRCODE_FILE_NO_EXIST',
  FunctionNotSupport = 'PLKSS_ERRCODE_FUNCTION_NOT_SUPPORT',
  InvalidParam = 'PLKSS_ERRCODE_INVALID_PARAM',
  NoScanParam = /** < Not do  */ 'PLKSS_ERRCODE_NO_SCAN_PARAM',
  OpenFailInvalidHandle = /* open fail with invalid handle */ 'PLKSS_ERRCODE_OPEN_FAIL_INVALID_HANDLE',
  SaneStatusUnsupported = /* operation is not supported */ 'PLKSS_ERRCODE_SANE_STATUS_UNSUPPORTED',
  SaneStatusCancelled = /* operation was cancelled */ 'PLKSS_ERRCODE_SANE_STATUS_CANCELLED',
  SaneStatusDeviceBusy = /* device is busy; try again later */ 'PLKSS_ERRCODE_SANE_STATUS_DEVICE_BUSY',
  SaneStatusInval = /* data is invalid (includes no dev at open) */ 'PLKSS_ERRCODE_SANE_STATUS_INVAL',
  SaneStatusEof = /* no more data available (end-of-file) */ 'PLKSS_ERRCODE_SANE_STATUS_EOF',
  SaneStatusJammed = /* document feeder jammed */ 'PLKSS_ERRCODE_SANE_STATUS_JAMMED',
  SaneStatusNoDocs = /* document feeder out of documents */ 'PLKSS_ERRCODE_SANE_STATUS_NO_DOCS',
  SaneStatusCoverOpen = /* scanner cover is open */ 'PLKSS_ERRCODE_SANE_STATUS_COVER_OPEN',
  SaneStatusIoError = /* error during device I/O */ 'PLKSS_ERRCODE_SANE_STATUS_IO_ERROR',
  SaneStatusNoMem = /* out of memory */ 'PLKSS_ERRCODE_SANE_STATUS_NO_MEM',
  SaneStatusAccessDenied = /* access to resource has been denied */ 'PLKSS_ERRCODE_SANE_STATUS_ACCESS_DENIED',
  PaperStatusReady = 'PLKSS_ERRCODE_PAPER_STATUS_READY',
  CbStatusSuccess = 'PLKSS_ERRCODE_CB_STATUS_SUCCESS',
  CbStatusIlRemoveBlankPageSuccess = 'PLKSS_ERRCODE_CB_STATUS_IL_REMOVE_BLANK_PAGE_SUCCESS',
  CbStatusMergeSuccess = 'PLKSS_ERRCODE_CB_STATUS_MERGE_SUCCESS',
  VtmPsDevReadyNoPaper = 'PLKSS_ERRCODE_VTM_PS_DEV_READY_NO_PAPER',
  VtmPsReadyToScan = 'PLKSS_ERRCODE_VTM_PS_READY_TO_SCAN',
  VtmPsReadyToEject = 'PLKSS_ERRCODE_VTM_PS_READY_TO_EJECT',
  VtmPsFrontAndBackSensorHavePaperReady = 'PLKSS_ERRCODE_VTM_PS_FRONT_AND_BACK_SENSOR_HAVE_PAPER_READY',
  Unknown = 'UNKNOWN',
}

/**
 * Schema for parsing a {@link ScannerError}.
 */
export const ScannerErrorSchema = z.nativeEnum(ScannerError);

/**
 * Parses an error string as either one of the {@link ScannerError} values, or a
 * generic error if it doesn't match.
 */
export function parseScannerError(error: string): ScannerError | Error {
  const result = safeParse(ScannerErrorSchema, error);
  return result.isErr() ? new Error(error) : result.ok();
}
