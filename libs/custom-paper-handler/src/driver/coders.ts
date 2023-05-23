import {
  CoderType,
  literal,
  message,
  uint16,
  uint32,
  uint8,
} from '@votingworks/message-coder';
import { TOKEN } from './constants';

/**
 * Response coders
 */

// Real-time exchange responses have the same fields but variable lengths of "optional" data.
// This implementation isn't DRY but is explicit. It would be more DRY and less explicit to
// extend message-coder to support an unbounded ArrayBuffer coder
export const SensorStatusRealTimeExchangeResponse = message({
  startOfPacket: literal(0x82),
  requestId: uint8(),
  token: literal(TOKEN),
  returnCode: uint8(),
  optionalDataLength: uint8(),
  optionalByte0: uint8(),
  optionalByte1: uint8(),
  optionalByte2: uint8(),
  optionalByte3: uint8(),
});

export type SensorStatusRealTimeExchangeResponse = CoderType<
  typeof SensorStatusRealTimeExchangeResponse
>;

export const PrinterStatusRealTimeExchangeResponse = message({
  startOfPacket: literal(0x82),
  requestId: uint8(),
  token: literal(TOKEN),
  returnCode: uint8(),
  optionalDataLength: uint8(),
  optionalByte0: uint8(),
  optionalByte1: uint8(),
  optionalByte2: uint8(),
  optionalByte3: uint8(),
  optionalByte4: uint8(),
  optionalByte5: uint8(),
});
export type PrinterStatusRealTimeExchangeResponse = CoderType<
  typeof PrinterStatusRealTimeExchangeResponse
>;

export const RealTimeExchangeResponseWithoutData = message({
  startOfPacket: literal(0x82),
  requestId: uint8(),
  token: literal(TOKEN),
  returnCode: uint8(),
  optionalDataLength: literal(0x00),
});
export type RealTimeExchangeResponseWithoutData = CoderType<
  typeof RealTimeExchangeResponseWithoutData
>;

export const AcknowledgementResponse = uint8();
export type AcknowledgementResponse = CoderType<typeof AcknowledgementResponse>;

export const ScanResponse = message({
  signature: literal('IMG'),
  returnCode: uint8(),
  cis: uint8(0x00 | 0x01 | 0x02),
  scan: uint8(),
  sizeX: uint16(),
  sizeY: uint16(),
  status: uint16(),
  dummy: uint32(), // 4 unused bytes
});

/**
 * Command coders
 */
export const LoadPaperCommand = literal(0x1c, 0x53, 0x50, 0x4c);
export type LoadPaperCommand = CoderType<typeof LoadPaperCommand>;

export const ParkPaperCommand = literal(0x1c, 0x53, 0x50, 0x50);
export type ParkPaperCommand = CoderType<typeof ParkPaperCommand>;

export const EjectPaperCommand = literal(0x1c, 0x53, 0x50, 0x45);
export type EjectPaperCommand = CoderType<typeof EjectPaperCommand>;

export const PresentPaperAndHoldCommand = literal(0x1c, 0x53, 0x50, 0x46);
export type PresentPaperAndHoldCommand = CoderType<
  typeof PresentPaperAndHoldCommand
>;

export const EjectPaperToBallotCommand = literal(0x1c, 0x53, 0x50, 0x48);
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

export const ConfigureScannerCommand = message({
  command: literal(0x1c, 0x53, 0x50, 0x43),
  optionPaperConfig: uint8(0x00 | 0x01 | 0x02 | 0x03),
  optionSensorConfig: uint8(0x00 | 0x04),
  flags: uint8(0x00 | 0x01 | 0x02),
  cis: literal(0x00), // Unsupported
  scan: uint8(),
  dpiX: uint16(undefined, { littleEndian: false }),
  dpiY: uint16(undefined, { littleEndian: false }),
  sizeX: uint16(undefined, { littleEndian: false }),
  sizeY: uint32(undefined, { littleEndian: false }),
});
export type ConfigureScannerCommand = CoderType<typeof ConfigureScannerCommand>;

export const GetScannerCapabilityCommand = literal(0x1c, 0x53, 0x43, 0x47);
export type GetScannerCapabilityCommand = CoderType<
  typeof GetScannerCapabilityCommand
>;

export const ScanCommand = literal(0x1c, 0x53, 0x50, 0x53);
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
