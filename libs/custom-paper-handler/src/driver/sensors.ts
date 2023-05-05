import { assert } from '@votingworks/basics';
import { BitArray, Uint8, Uint8ToBitArray } from '../bits';

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
export interface ScannerStatus {
  // FIRST BYTE, MSB first
  parkSensor: boolean; // 0x80
  paperOutSensor: boolean; // 0x40
  paperPostCisSensor: boolean; // 0x20
  paperPreCisSensor: boolean; // 0x10
  paperInputLeftInnerSensor: boolean; // 0x08
  paperInputRightInnerSensor: boolean; // 0x04
  paperInputLeftOuterSensor: boolean; // 0x02
  paperInputRightOuterSensor: boolean; // 0x01

  // SECOND BYTE, MSB first
  // reserved 0x80
  printHeadInPosition: boolean; // 0x40
  scanTimeout: boolean; // 0x20
  motorMove: boolean; // 0x10
  scanInProgress: boolean; // 0x08
  jamEncoder: boolean; // 0x04
  paperJam: boolean; // 0x02
  coverOpen: boolean; // 0x01, tells you if printer handler unit is not closed shut, distinct from optoSensor

  // THIRD BYTE, MSB first
  // reserved 0x80
  // reserved 0x40
  // reserved 0x20
  // reserved 0x10
  optoSensor: boolean; // 0x08, tells you if VSAP plastic lid is open
  ballotBoxDoorSensor: boolean; // 0x04
  ballotBoxAttachSensor: boolean; // 0x02
  preHeadSensor: boolean; // 0x01
}

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

export type PaperHandlerStatus = ScannerStatus & PrinterStatus;

// See: page 60 of manual
export function parseScannerStatus(data: DataView): ScannerStatus {
  /**
   * The device answer is as follows: 0x82 0x73 tk Retcode 0x04 STS
   * where all components of the answer are 1 byte except STS, which is 4 bytes.
   * Therefore the complete answer is 9 bytes.
   */
  assert(data.byteLength === 9);

  // We get the first part of the response from the 5th byte (0-indexed) ie. the start of STS
  // Uint8ToBitArray takes a Uint8 and returns a bit array with MSB in the 0th position of the bit array
  const [
    parkSensor,
    paperOutSensor,
    paperPostCisSensor,
    paperPreCisSensor,
    // This differs from documentation
    paperInputLeftInnerSensor,
    paperInputRightInnerSensor,
    paperInputLeftOuterSensor,
    paperInputRightOuterSensor,
  ] = Uint8ToBitArray(data.getUint8(5) as Uint8);

  const [
    ,
    printHeadInPosition,
    scanTimeout,
    motorMove,
    scanInProgress,
    jamEncoder,
    paperJam,
    coverOpen,
  ] = Uint8ToBitArray(data.getUint8(6) as Uint8);

  const [
    ,
    ,
    ,
    ,
    optoSensor,
    ballotBoxDoorSensor,
    ballotBoxAttachSensor,
    preHeadSensor,
  ] = Uint8ToBitArray(data.getUint8(7) as Uint8);

  // The fourth byte is fixed to 0x00 and doesn't need to be parsed

  return {
    parkSensor,
    paperOutSensor,
    paperPostCisSensor,
    paperPreCisSensor,
    paperInputLeftInnerSensor,
    paperInputRightInnerSensor,
    paperInputLeftOuterSensor,
    paperInputRightOuterSensor,
    printHeadInPosition,
    scanTimeout,
    motorMove,
    scanInProgress,
    jamEncoder,
    paperJam,
    coverOpen,
    optoSensor,
    ballotBoxDoorSensor,
    ballotBoxAttachSensor,
    preHeadSensor,
  };
}

export function parsePrinterStatus(data: DataView): PrinterStatus {
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
