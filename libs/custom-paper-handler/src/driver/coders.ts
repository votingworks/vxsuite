import { CoderType, literal, message, uint8 } from '@votingworks/message-coder';
import { TOKEN } from './constants';

// This is not very DRY but results from 2 issues
// 1. Real-time exchange responses have an optional data field whose length varies between command responses.
// 2. unboundedString() is the only unbounded coder type, but utf-8 string encoding adds extra bits
// TODO how does custom-scanner deal with optional data of varying lengths?
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
