import { CoderType, literal, message, uint8 } from '@votingworks/message-coder';
import { TOKEN } from './constants';

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
