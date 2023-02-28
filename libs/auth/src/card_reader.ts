import { Buffer } from 'buffer';
import pcscLite from 'pcsclite';
import { promisify } from 'util';
import { assert } from '@votingworks/basics';
import { isByte } from '@votingworks/types';

import {
  CommandApdu,
  GET_RESPONSE,
  MAX_APDU_LENGTH,
  ResponseApduError,
  STATUS_WORD,
} from './apdu';

type PcscLite = ReturnType<typeof pcscLite>;

interface ReaderReady {
  status: 'ready';
  transmit: (data: Buffer) => Promise<Buffer>;
}

interface ReaderNotReady {
  status: 'card_error' | 'no_card_reader' | 'no_card' | 'unknown_error';
}

type Reader = ReaderReady | ReaderNotReady;

type OnReaderStatusChange = (readerStatus: Reader['status']) => void;

/**
 * A class for interfacing with a smart card reader, implemented using PCSC Lite
 */
export class CardReader {
  private readonly onReaderStatusChange: OnReaderStatusChange;
  private readonly pcscLite: PcscLite;
  private reader: Reader;

  constructor(input: { onReaderStatusChange: OnReaderStatusChange }) {
    this.onReaderStatusChange = input.onReaderStatusChange;
    this.pcscLite = pcscLite();
    this.reader = { status: 'no_card_reader' };

    this.pcscLite.on('error', () => {
      this.updateReader({ status: 'unknown_error' });
    });

    this.pcscLite.on('reader', (reader) => {
      reader.on('error', () => {
        this.updateReader({ status: 'unknown_error' });
      });

      reader.on('status', (status) => {
        const isCardPresent = Boolean(
          // eslint-disable-next-line no-bitwise
          status.state & reader.SCARD_STATE_PRESENT
        );
        if (isCardPresent) {
          reader.connect(
            // Don't allow anyone else to access the card reader while this code is accessing it
            { share_mode: reader.SCARD_SHARE_EXCLUSIVE },
            (error, protocol) => {
              if (error) {
                this.updateReader({ status: 'card_error' });
                return;
              }
              const transmitPromisified = promisify(reader.transmit).bind(
                reader
              );
              this.updateReader({
                status: 'ready',
                transmit: (data: Buffer) =>
                  transmitPromisified(data, MAX_APDU_LENGTH, protocol),
              });
            }
          );
        } else {
          this.updateReader({ status: 'no_card' });
          reader.disconnect(() => undefined);
        }
      });

      reader.on('end', () => {
        this.updateReader({ status: 'no_card_reader' });
      });
    });
  }

  getReaderStatus(): Reader['status'] {
    return this.reader.status;
  }

  /**
   * Transmits a command APDU to a smart card. On success, returns response data. On error, throws.
   * Specifically throws a ResponseApduError when a response APDU with a non-success status word is
   * received.
   */
  async transmit(apdu: CommandApdu): Promise<Buffer> {
    let { data, moreDataAvailable } = await this.transmitHelper(apdu);

    while (moreDataAvailable) {
      const response = await this.transmitHelper(
        new CommandApdu({
          ins: GET_RESPONSE.INS,
          p1: GET_RESPONSE.P1,
          p2: GET_RESPONSE.P2,
        })
      );
      data = Buffer.concat([data, response.data]);
      moreDataAvailable = response.moreDataAvailable;
    }

    return data;
  }

  private async transmitHelper(
    apdu: CommandApdu
  ): Promise<{ data: Buffer; moreDataAvailable: boolean }> {
    if (this.reader.status !== 'ready') {
      throw new Error('Reader not ready');
    }

    let response: Buffer;
    try {
      response = await this.reader.transmit(apdu.asBuffer());
    } catch {
      throw new Error('Failed to transmit data to card');
    }

    const data = response.subarray(0, -2);
    const [sw1, sw2] = response.subarray(-2);
    assert(sw1 !== undefined && sw2 !== undefined);
    assert(isByte(sw1) && isByte(sw2));
    if (sw1 === STATUS_WORD.SUCCESS.SW1 && sw2 === STATUS_WORD.SUCCESS.SW2) {
      return { data, moreDataAvailable: false };
    }
    if (sw1 === STATUS_WORD.SUCCESS_MORE_DATA_AVAILABLE.SW1) {
      return { data, moreDataAvailable: true };
    }
    throw new ResponseApduError([sw1, sw2]);
  }

  private updateReader(reader: Reader): void {
    const readerStatusChange = this.reader.status !== reader.status;
    this.reader = reader;
    if (readerStatusChange) {
      this.onReaderStatusChange(reader.status);
    }
  }
}
