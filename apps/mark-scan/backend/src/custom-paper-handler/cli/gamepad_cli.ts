// import { sleep } from '@votingworks/basics';
// import { SerialPort } from 'serialport';
// const SMARTMATIC_VENDOR_ID = 0x28cd;
// const GAMEPAD_PRODUCT_ID = 0x4008;
import { Buffer } from 'buffer';
import { sleep } from '@votingworks/basics';
import {
  CoderType,
  literal,
  message,
  uint8,
  uint16,
  Uint8,
  Uint16,
} from '@votingworks/message-coder';

const ButtonStatusCommandId: Uint8 = 0x30;
const ButtonStatusPayloadSize: Uint16 = 0x0002;

export enum ControllerButton {
  RATE_DOWN = 0x00,
  RATE_UP = 0x01,
  CONFIRM = 0x02,
  VOLUME_UP = 0x03,
  VOLUME_DOWN = 0x04,
  RIGHT = 0x05,
  LEFT = 0x06,
  UP = 0x07,
  DOWN = 0x08,
  HELP = 0x09,
  PAUSE = 0x0a,
}

export enum ButtonState {
  PRESSED = 0x01,
  RELEASED = 0x00,
}

// CRC value is provided in every data packet. It's basically a hash of
// the other data in the packet and guarantees data integrity ie. no noise
// has resulted in an incorrect data packet.
// While it's possible to compute the CRC value, it's deterministic and
// our set of commands is sufficiently small that we can just enumerate them.
// https://en.wikipedia.org/wiki/Cyclic_redundancy_check
enum CrcValidation {
  RATE_DOWN_PRESSED = 0x72af,
  RATE_DOWN_RELEASED = 0x628e,
  RATE_UP_PRESSED = 0x419e,
  RATE_UP_RELEASED = 0x51bf,
  CONFIRM_PRESSED = 0x14cd,
  CONFIRM_RELEASED = 0x04ec,
  VOLUME_UP_PRESSED = 0x27fc,
  VOLUME_UP_RELEASED = 0x37dd,
  RIGHT_PRESSED = 0x8d5a,
  RIGHT_RELEASED = 0x9d7b,
  LEFT_PRESSED = 0xd809,
  LEFT_RELEASED = 0xc828,
  UP_PRESSED = 0xeb38,
  UP_RELEASED = 0xfb19,
  DOWN_PRESSED = 0xfb06,
  DOWN_RELEASED = 0xeb27,
  HELP_PRESSED = 0xc837,
  HELP_RELEASED = 0xd816,
  PAUSE_PRESSED = 0x9d64,
  PAUSE_RELEASED = 0x8d45,
}

export const ButtonAction = message({
  commandId: literal(ButtonStatusCommandId),
  payloadSize: literal(ButtonStatusPayloadSize),
  button: uint8<ControllerButton>(),
  state: uint8<ButtonState>(),
  crcValidation: uint16<CrcValidation>(),
});
type ButtonAction = CoderType<typeof ButtonAction>;

export async function main(): Promise<number> {
  const buf = Buffer.of(0x30, 0x00, 0x02, 0x00, 0x01, 0x72, 0xaf);
  const result = ButtonAction.decode(buf);
  console.log('success:', result.isOk());
  const unwrapped = result.unsafeUnwrap();
  console.log(unwrapped);
  /*
  console.log('Connecting ...');
  const port = new SerialPort({
    path: '/dev/ttyACM1',
    baudRate: 9600,
  });

  console.log('Connected ...');
  port.on('data', (data) => {
    console.log('data received', data);
  });

  port.on('error', (err: Error) => {
    console.error('Error', err.message);
  });

  await sleep(10000);

  return 0;
  */

  await sleep(500);
  return 0;
}
