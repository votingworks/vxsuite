import * as z from 'zod';

/**
 * Possible paper status values returned by the plustek drivers.
 *
 * Weirdly, Plustek has an errcode version of each paper status, which often is
 * returned instead of the paper status itself. So we include both here, using
 * the errcode version as the primary value.
 */
export enum PaperStatus {
  NoPaperStatus = 'PAPER_STATUS_NO_PAPER',
  NoPaper = 'PLKSS_ERRCODE_PAPER_STATUS_NO_PAPER',
  ReadyStatus = 'PAPER_STATUS_READY',
  Ready = 'PLKSS_ERRCODE_PAPER_STATUS_READY',
  OnDocumentTrayStatus = 'PAPER_STATUS_ON_DOCUMENT_TRAY',
  OnDocumentTray = 'PLKSS_ERRCODE_PAPER_STATUS_ON_DOCUMENT_TRAY',
  LoadingStatus = 'PAPER_STATUS_LOADING',
  Loading = 'PLKSS_ERRCODE_PAPER_STATUS_LOADING',
  EjectingStatus = 'PAPER_STATUS_EJECTING',
  Ejecting = 'PLKSS_ERRCODE_PAPER_STATUS_EJECTING',
  JamStatus = 'PAPER_STATUS_JAM',
  Jam = 'PLKSS_ERRCODE_PAPER_STATUS_JAM',
  ErrorFeedingStatus = 'PAPER_STATUS_ERROR_FEEDING',
  ErrorFeeding = 'PLKSS_ERRCODE_PAPER_STATUS_ERROR_FEEDING',
  CoverOpenedStatus = 'PAPER_STATUS_COVER_OPENED',
  CoverOpened = 'PLKSS_ERRCODE_PLKSS_ERRCODE_PAPER_STATUS_COVER_OPENED',
  ScanningStatus = 'PAPER_STATUS_SCANNING',
  Scanning = 'PLKSS_ERRCODE_PAPER_STATUS_SCANNING',
  MultifeedStatus = 'PAPER_STATUS_MULTIFEED',
  Multifeed = 'PLKSS_ERRCODE_PAPER_STATUS_MULTIFEED',
  XferConditionStatus = 'PAPER_STATUS_XFER_CONDITION',
  XferCondition = 'PAPER_STATUS_XFER_CONDITION',
  VtmDevReadyNoPaper = 'PLKSS_ERRCODE_VTM_PS_DEV_READY_NO_PAPER',
  VtmReadyToScan = 'PLKSS_ERRCODE_VTM_PS_READY_TO_SCAN',
  VtmReadyToEject = 'PLKSS_ERRCODE_VTM_PS_READY_TO_EJECT',
  VtmFrontAndBackSensorHavePaperReady = 'PLKSS_ERRCODE_VTM_PS_FRONT_AND_BACK_SENSOR_HAVE_PAPER_READY',
  VtmBothSideHavePaper = 'PLKSS_ERRCODE_VTM_BOTH_SIDE_HAVE_PAPER',
}

/**
 * Schema for parsing paper status value strings returned from `plustekctl`.
 */
export const PaperStatusSchema = z.nativeEnum(PaperStatus);
