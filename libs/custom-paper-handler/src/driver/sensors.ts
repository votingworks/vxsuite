import { assert } from '@votingworks/basics';
import { BitArray, Uint8, Uint8ToBitArray } from '../bits';
import {
  PrinterStatusRealTimeExchangeResponse,
  SensorStatusRealTimeExchangeResponse,
} from './coders';

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

export interface PrinterStatus {
  // FIRST BYTE, 0x10

  // SECOND BYTE, 0x0F

  // THIRD BYTE
  // reserved 0x80
  // reserved 0x40
  ticketPresentInOutput: boolean; // 0x20
  // reserved 0x10
  // reserved 0x08
  // reserved 0x04
  // reserved 0x02
  paperNotPresent: boolean; // 0x01

  // FOURTH BYTE
  // reserved 0x80
  // reserved 0x40
  // reserved 0x20
  // reserved 0x10
  dragPaperMotorOn: boolean; // 0x08
  spooling: boolean; // 0x04
  coverOpen: boolean; // 0x02
  printingHeadUpError: boolean; // 0x01

  // FIFTH BYTE
  // reserved 0x80
  notAcknowledgeCommandError: boolean; // 0x40
  // reserved 0x20
  // reserved 0x10
  powerSupplyVoltageError: boolean; // 0x08
  headNotConnected: boolean; // 0x04
  comError: boolean; // 0x02
  headTemperatureError: boolean; // 0x01

  // SIXTH BYTE
  diverterError: boolean; // 0x80
  headErrorLocked: boolean; // 0x40
  printingHeadReadyToPrint: boolean; // 0x20
  // reserved 0x10
  eepromError: boolean; // 0x08
  ramError: boolean; // 0x04
  // reserved 0x02
  // reserved 0x01
}

export type PaperHandlerStatus = SensorStatusRealTimeExchangeResponse &
  PrinterStatus;

export function parsePrinterStatus(
  response: PrinterStatusRealTimeExchangeResponse
): PrinterStatus {
  // Bytes 0 and 1 are fixed and don't communicate printer status, so we don't need to parse them
  const [, , ticketPresentInOutput, , , , , paperNotPresent]: BitArray =
    Uint8ToBitArray(response.optionalByte2 as Uint8);

  const [, , , , dragPaperMotorOn, spooling, coverOpen, printingHeadUpError] =
    Uint8ToBitArray(response.optionalByte3 as Uint8);

  const [
    ,
    ,
    notAcknowledgeCommandError,
    ,
    powerSupplyVoltageError,
    headNotConnected,
    comError,
    headTemperatureError,
  ] = Uint8ToBitArray(response.optionalByte4 as Uint8);

  const [
    diverterError,
    headErrorLocked,
    printingHeadReadyToPrint,
    ,
    eepromError,
    ramError,
    ,
    ,
  ] = Uint8ToBitArray(response.optionalByte5 as Uint8);

  return {
    ticketPresentInOutput,
    paperNotPresent,
    dragPaperMotorOn,
    spooling,
    coverOpen,
    printingHeadUpError,
    notAcknowledgeCommandError,
    powerSupplyVoltageError,
    headNotConnected,
    comError,
    headTemperatureError,
    diverterError,
    headErrorLocked,
    printingHeadReadyToPrint,
    eepromError,
    ramError,
  };
}

export function parsePrinterStatusDeprecated(data: DataView): PrinterStatus {
  assert(data.byteLength === 11);
  const [, , ticketPresentInOutput, , , , , paperNotPresent]: BitArray =
    Uint8ToBitArray(data.getUint8(7) as Uint8);

  const [, , , , dragPaperMotorOn, spooling, coverOpen, printingHeadUpError] =
    Uint8ToBitArray(data.getUint8(8) as Uint8);

  const [
    ,
    ,
    notAcknowledgeCommandError,
    ,
    powerSupplyVoltageError,
    headNotConnected,
    comError,
    headTemperatureError,
  ] = Uint8ToBitArray(data.getUint8(9) as Uint8);

  const [
    diverterError,
    headErrorLocked,
    printingHeadReadyToPrint,
    ,
    eepromError,
    ramError,
    ,
    ,
  ] = Uint8ToBitArray(data.getUint8(10) as Uint8);

  return {
    ticketPresentInOutput,
    paperNotPresent,
    dragPaperMotorOn,
    spooling,
    coverOpen,
    printingHeadUpError,
    notAcknowledgeCommandError,
    powerSupplyVoltageError,
    headNotConnected,
    comError,
    headTemperatureError,
    diverterError,
    headErrorLocked,
    printingHeadReadyToPrint,
    eepromError,
    ramError,
  };
}
