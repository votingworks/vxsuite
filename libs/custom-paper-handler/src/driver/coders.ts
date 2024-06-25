import {
  CoderType,
  literal,
  message,
  padding,
  uint1,
  uint16,
  uint32,
  uint8,
} from '@votingworks/message-coder';
import { START_OF_PACKET, TOKEN } from './constants';

export interface PaperHandlerBitmap {
  data: Uint8Array;
  width: number;
}

export const TransferOutRealTimeRequest = message({
  stx: literal(START_OF_PACKET),
  requestId: uint8(),
  token: literal(TOKEN),
  // Treat "optional data length" byte as padding when no additional data is supplied
  unusedOptionalDataLength: padding(8),
});
type TransferOutRealTimeRequest = CoderType<typeof TransferOutRealTimeRequest>;

/**
 * Response coders
 */

/**
 * Contains the pieces of state that we receive from the scanner.
 *
 * The paper input sensors are particularly poorly named in the Custom
 * documentation, so we are using our own terms here. Viewed from the
 * front of the unit (where you would feed in paper) the sensors are named
 * as follows:
 *
 *   (1)---(2)--------------------------------------------(3)---(4)
 *
 * 1. paperInputLeftOuterSensor, called paperInputInternRightSensor in docs
 * 2. paperInputLeftInnerSensor, called paperInputInternLeftSensor in docs
 * 3. paperInputRightInnerSensor, called paperInputExternLeftSensor in docs
 * 4. paperInputRightOuterSensor, called paperInputExternRightSensor in docs
 *
 */
export const SensorStatusRealTimeExchangeResponse = message({
  startOfPacket: literal(0x82),
  requestId: uint8(),
  token: literal(TOKEN),
  returnCode: uint8(),
  optionalDataLength: literal(4),
  // Byte 0
  parkSensor: uint1(),
  paperOutSensor: uint1(),
  paperPostCisSensor: uint1(),
  paperPreCisSensor: uint1(),
  paperInputLeftInnerSensor: uint1(),
  paperInputRightInnerSensor: uint1(),
  paperInputLeftOuterSensor: uint1(),
  paperInputRightOuterSensor: uint1(),
  // Byte 1
  notUsedByte1: padding(1),
  printHeadInPosition: uint1(),
  scanTimeout: uint1(),
  motorMove: uint1(),
  scanInProgress: uint1(),
  jamEncoder: uint1(),
  paperJam: uint1(),
  coverOpen: uint1(),
  // Byte 2
  notUsedByte2: padding(4),
  optoSensor: uint1(),
  // Ballot box sensor state bits are confusing, but might be thought of as "true when the ballot box needs attention"
  // true when the door is open or the ballot box itself is not attached
  ballotBoxDoorSensor: uint1(),
  // true when the ballot box is not attached
  ballotBoxAttachSensor: uint1(),
  preHeadSensor: uint1(),
  notUsedByte3: padding(8),
});

export type SensorStatusRealTimeExchangeResponse = CoderType<
  typeof SensorStatusRealTimeExchangeResponse
>;

const printerStatusMessage = {
  // Byte 0 fixed
  dle: literal(0x10),
  // Byte 1 fixed
  eot: literal(0x0f),
  // Byte 2 paper status
  byte2Padding0: padding(2),
  ticketPresentInOutput: uint1(),
  byte2Padding1: padding(4),
  paperNotPresent: uint1(),
  // Byte 3 user status
  byte3Padding: padding(4),
  dragPaperMotorOn: uint1(),
  spooling: uint1(),
  coverOpen: uint1(),
  printingHeadUpError: uint1(),
  // Byte 4 recoverable error status
  byte4Padding0: padding(2),
  notAcknowledgeCommandError: uint1(),
  byte4Padding1: padding(1),
  powerSupplyVoltageError: uint1(),
  headNotConnected: uint1(),
  comError: uint1(),
  headTemperatureError: uint1(),
  // Byte 5 unrecoverable error status
  diverterError: uint1(),
  headErrorLocked: uint1(),
  printingHeadReadyToPrint: uint1(),
  byte3Padding0: padding(1),
  eepromError: uint1(),
  ramError: uint1(),
  byte3Padding1: padding(2),
} as const;

export const PrinterStatusRealTimeExchangeResponse = message({
  startOfPacket: literal(0x82),
  requestId: uint8(),
  token: literal(TOKEN),
  returnCode: uint8(),
  optionalDataLength: literal(6),
  ...printerStatusMessage,
});
export type PrinterStatusRealTimeExchangeResponse = CoderType<
  typeof PrinterStatusRealTimeExchangeResponse
>;

export const RealTimeExchangeResponseWithoutData = message({
  startOfPacket: literal(0x82),
  requestId: uint8(),
  token: literal(TOKEN),
  returnCode: uint8(),
  optionalBytes: padding(1),
});
export type RealTimeExchangeResponseWithoutData = CoderType<
  typeof RealTimeExchangeResponseWithoutData
>;

export const RealTimeStatusTransmission = message(printerStatusMessage);
export type RealTimeStatusTransmission = CoderType<
  typeof RealTimeStatusTransmission
>;

export const AcknowledgementResponse = uint8();
export type AcknowledgementResponse = CoderType<typeof AcknowledgementResponse>;

export const ScanResponse = message({
  signature: literal('IMG'),
  returnCode: uint8(),
  cis: uint8(0x00 | 0x01 | 0x02),
  scan: uint8(),
  sizeX: uint16(undefined, { littleEndian: false }),
  sizeY: uint16(undefined, { littleEndian: false }),
  status: uint16(),
  dummy: padding(32),
});
export type ScanResponse = CoderType<typeof ScanResponse>;

/**
 * Command coders
 */
export const LoadPaperCommand = literal(0x1c, 'SPL');
export type LoadPaperCommand = CoderType<typeof LoadPaperCommand>;

export const ParkPaperCommand = literal(0x1c, 'SPP');
export type ParkPaperCommand = CoderType<typeof ParkPaperCommand>;

export const EjectPaperCommand = literal(0x1c, 'SPE');
export type EjectPaperCommand = CoderType<typeof EjectPaperCommand>;

export const PresentPaperAndHoldCommand = literal(0x1c, 'SPF');
export type PresentPaperAndHoldCommand = CoderType<
  typeof PresentPaperAndHoldCommand
>;

export const EjectPaperToBallotCommand = literal(0x1c, 'SPH');
export type EjectPaperToBallotCommand = CoderType<
  typeof EjectPaperToBallotCommand
>;

export const ScannerCalibrationCommand = literal(0x1f, 0x43);
export type ScannerCalibrationCommand = CoderType<
  typeof ScannerCalibrationCommand
>;

export const EnablePrintCommand = literal(0x1f, 0x45);
export type EnablePrintCommand = CoderType<typeof EnablePrintCommand>;

export const DisablePrintCommand = literal(0x1f, 0x65);
export type DisablePrintCommand = CoderType<typeof DisablePrintCommand>;

export enum ConfigureScannerOptionPaperConfigValues {
  HOLD_PAPER_AFTER_SCAN = 0x00,
  MOVE_FORWARD_AFTER_SCAN = 0x01,
  MOVE_BACKWARD_AFTER_SCAN = 0x02,
  MOVE_FORWARD_AFTER_SCAN_AND_HOLD = 0x03,
}
export enum ConfigureScannerOptionSensorConfig {
  NONE = 0x00,
  DISABLE_JAM_WHEEL_SENSOR = 0x04,
}
export enum ConfigureScannerFlags {
  NONE = 0x00,
  SCAN_BACKWARDS = 0x01,
  SCAN_IN_PARK = 0x03,
}
export const ConfigureScannerCommand = message({
  command: literal(0x1c, 'SPC'),
  optionPaperConfig: uint8(ConfigureScannerOptionPaperConfigValues),
  optionSensorConfig: uint8(ConfigureScannerOptionSensorConfig),
  flags: uint8(ConfigureScannerFlags),
  cis: literal(0x00), // Unsupported
  scan: uint8(),
  dpiX: uint16(undefined, { littleEndian: false }),
  dpiY: uint16(undefined, { littleEndian: false }),
  sizeX: uint16(undefined, { littleEndian: false }),
  sizeY: uint32(undefined, { littleEndian: false }),
});
export type ConfigureScannerCommand = CoderType<typeof ConfigureScannerCommand>;

export const GetScannerCapabilityCommand = literal(0x1c, 'SCG');
export type GetScannerCapabilityCommand = CoderType<
  typeof GetScannerCapabilityCommand
>;

export const ScanCommand = literal(0x1c, 'SPS');
export type ScanCommand = CoderType<typeof ScanCommand>;

export const PrintAndFeedPaperCommand = message({
  command: literal(0x1b, 0x4a),
  numMotionUnitsToFeedPaper: uint8(),
});
export type PrintAndFeedPaperCommand = CoderType<
  typeof PrintAndFeedPaperCommand
>;

export const SetAbsolutePrintPositionCommand = message({
  command: literal(0x1b, 0x24),
  nL: uint8(),
  nH: uint8(),
});
export type SetAbsolutePrintPositionCommand = CoderType<
  typeof SetAbsolutePrintPositionCommand
>;

export const SetRelativePrintPositionCommand = message({
  command: literal(0x1b, 0x5c),
  nL: uint8(),
  nH: uint8(),
});
export type SetRelativePrintPositionCommand = CoderType<
  typeof SetRelativePrintPositionCommand
>;

export const SetRelativeVerticalPrintPositionCommand = message({
  command: literal(0x1b, 0x28, 0x76),
  nL: uint8(),
  nH: uint8(),
});
export type SetRelativeVerticalPrintPositionCommand = CoderType<
  typeof SetRelativeVerticalPrintPositionCommand
>;

export const SetLeftMarginCommand = message({
  command: literal(0x1d, 0x4c),
  nL: uint8(),
  nH: uint8(),
});
export type SetLeftMarginCommand = CoderType<typeof SetLeftMarginCommand>;

export const SetPrintingAreaWidthCommand = message({
  command: literal(0x1d, 0x57),
  nL: uint8(),
  nH: uint8(),
});
export type SetPrintingAreaWidthCommand = CoderType<
  typeof SetPrintingAreaWidthCommand
>;

export const SetPrintingDensityCommand = message({
  command: literal(0x1d, 0x7c),
  density: uint8(),
});
export type SetPrintingDensityCommand = CoderType<
  typeof SetPrintingDensityCommand
>;

export const SetPrintingSpeedCommand = message({
  command: literal(0x1d, 0xf0),
  speed: uint8(),
});
export type SetPrintingSpeedCommand = CoderType<typeof SetPrintingSpeedCommand>;

export const SetMotionUnitsCommand = message({
  command: literal(0x1d, 0x50),
  x: uint8(),
  y: uint8(),
});
export type SetMotionUnitsCommand = CoderType<typeof SetMotionUnitsCommand>;

export const SetLineSpacingCommand = message({
  command: literal(0x1b, 0x33),
  numMotionUnits: uint8(),
});
export type SetLineSpacingCommand = CoderType<typeof SetLineSpacingCommand>;

export const InitializeRequestCommand = literal(0x1b, 0x40);
export type InitializeRequestCommand = CoderType<typeof SetLineSpacingCommand>;

export type PaperHandlerStatus = SensorStatusRealTimeExchangeResponse &
  PrinterStatusRealTimeExchangeResponse;
