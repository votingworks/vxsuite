import * as z from 'zod'

export enum PaperStatus {
  NoPaper = 'PAPER_STATUS_NO_PAPER',
  Ready = 'PAPER_STATUS_READY',
  OnDocumentTray = 'PAPER_STATUS_ON_DOCUMENT_TRAY',
  Loading = 'PAPER_STATUS_LOADING',
  Ejecting = 'PAPER_STATUS_EJECTING',
  Jam = 'PAPER_STATUS_JAM',
  ErrorFeeding = 'PAPER_STATUS_ERROR_FEEDING',
  CoverOpened = 'PAPER_STATUS_COVER_OPENED',
  Scanning = 'PAPER_STATUS_SCANNING',
  Multifeed = 'PAPER_STATUS_MULTIFEED',
  XferCondition = 'PAPER_STATUS_XFER_CONDITION',
  Unknown = 'PAPER_STATUS_UNKNOWN',
  ReadyToEject = 'PLKSS_ERRCODE_VTM_PS_READY_TO_EJECT',
  VtmDevReadyNoPaper = 'PLKSS_ERRCODE_VTM_PS_DEV_READY_NO_PAPER',
  VtmReadyToScan = 'PLKSS_ERRCODE_VTM_PS_READY_TO_SCAN',
  VtmReadyToEject = 'PLKSS_ERRCODE_VTM_PS_READY_TO_EJECT',
  VtmFrontAndBackSensorHavePaperReady = 'PLKSS_ERRCODE_VTM_PS_FRONT_AND_BACK_SENSOR_HAVE_PAPER_READY',
}

export const PaperStatusSchema = z.nativeEnum(PaperStatus)
