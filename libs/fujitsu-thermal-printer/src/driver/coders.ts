import {
  CoderType,
  literal,
  message,
  padding,
  uint1,
  uint8,
} from '@votingworks/message-coder';

export const PrinterResetCommand = message({
  command: literal(0x1b, 0x40),
});

export const PrinterStatusResponse = message({
  // Byte 0 - Printer Information
  byte0Unused7: padding(1),
  paperFeedSensor: uint1(),
  byte0Unused5: padding(1),
  byte0Unused4: padding(1),
  isOffline: uint1(),
  byte0Unused2: padding(1),
  isBufferFull: uint1(),
  byte0Unused0: padding(1),

  // Byte 1 - Error Information
  byte1Unused7: padding(1),
  temperatureError: uint1(),
  hardwareError: uint1(),
  byte1Unused4: padding(1),
  byte1Unused3: padding(1),
  isPaperCoverOpen: uint1(),
  receiveDataError: uint1(),
  supplyVoltageError: uint1(),

  // Byte 2 - Paper Detection Information
  notUsedByte2: padding(5),
  isPaperAtEnd: uint1(),
  markUndetection: uint1(),
  isPaperNearEnd: uint1(),

  // Byte 3 - Reply Parameter
  replyParameter: uint8(),
});

export type RawPrinterStatus = CoderType<typeof PrinterStatusResponse>;

export enum BitImagePrintMode {
  SINGLE_DENSITY = 0x60,
  DOUBLE_DENSITY = 0x61,
  SINGLE_DENSITY_COMPRESSED = 0xe0,
  DOUBLE_DENSITY_COMPRESSED = 0xe1,
}

export const SetReplyParameterCommand = message({
  command: literal(0x1c, 0x72),
  parameter: uint8(),
});

export const FeedForwardCommand = message({
  command: literal(0x1b, 0x4a),
  dots: uint8(),
});

export enum SpeedSetting {
  Type1Mode1 = 0x60,
  Type1Mode2 = 0x61,
  Type1Mode3 = 0x62,
  Type1Mode4 = 0x63,
  Type1Mode5 = 0x64,
  Type2Mode1 = 0xc0,
  Type2Mode2 = 0xc1,
  Type2Mode3 = 0xc2,
  Type2Mode4 = 0xc3,
  Type2Mode5 = 0xc4,
}

export const SetSpeedSettingCommand = message({
  command: literal(0x1b, 0x73),
  speed: uint8(),
});

export interface QualityDetails {
  quality: 'high' | 'normal';
  automaticDivision: boolean;
}

export const SetQualityCommand = message({
  command: literal(0x1d, 0x45),
  automaticDivision: uint1(),
  unused: padding(4),
  qualityBit2: uint1(),
  qualityBit1: uint1(),
  qualityBit0: uint1(),
});

export function convertQualityDetails(
  details: QualityDetails
): CoderType<typeof SetQualityCommand> {
  return {
    qualityBit2: details.quality === 'normal',
    qualityBit1: details.quality === 'high',
    qualityBit0: details.quality === 'high',
    automaticDivision: details.automaticDivision,
  };
}

export const SetStandardEnergyCommand = message({
  command: literal(0x1c, 0x45),
  value: uint8(),
});
