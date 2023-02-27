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

type BaseTransmit = (data: Buffer) => Promise<Buffer>;

type PcscLite = ReturnType<typeof pcscLite>;

type ReaderStatus =
  | 'card_error'
  | 'no_card_reader'
  | 'no_card'
  | 'ready'
  | 'unknown_error';

/**
 * A class for interfacing with a smart card reader, implemented using PCSC Lite
 */
export class CardReader {
  private baseTransmit?: BaseTransmit;
  private readonly onReaderStatusChange: (readerStatus: ReaderStatus) => void;
  private readonly pcscLite: PcscLite;
  private readerStatus: ReaderStatus;

  constructor(input: {
    onReaderStatusChange: (readerStatus: ReaderStatus) => void;
  }) {
    this.baseTransmit = undefined;
    this.onReaderStatusChange = input.onReaderStatusChange;
    this.pcscLite = pcscLite();
    this.readerStatus = 'no_card_reader';

    this.pcscLite.on('error', () => {
      this.updateReaderStatus('unknown_error');
    });

    this.pcscLite.on('reader', (reader) => {
      reader.on('error', () => {
        this.updateReaderStatus('unknown_error');
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
                this.updateReaderStatus('card_error');
                return;
              }
              const transmitPromisified = promisify(reader.transmit).bind(
                reader
              );
              function transmit(data: Buffer) {
                return transmitPromisified(data, MAX_APDU_LENGTH, protocol);
              }
              this.updateReaderStatus('ready', transmit);
            }
          );
        } else {
          this.updateReaderStatus('no_card');
          reader.disconnect(() => undefined);
        }
      });

      reader.on('end', () => {
        this.updateReaderStatus('no_card_reader');
      });
    });
  }

  getReaderStatus(): ReaderStatus {
    return this.readerStatus;
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
    if (!this.baseTransmit) {
      throw new Error('Cannot transmit data to card');
    }

    let response: Buffer;
    try {
      response = await this.baseTransmit(apdu.asBuffer());
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

  private updateReaderStatus(
    readerStatus: ReaderStatus,
    baseTransmit?: BaseTransmit
  ): void {
    assert(
      (readerStatus === 'ready' && baseTransmit) ||
        (readerStatus !== 'ready' && baseTransmit === undefined)
    );
    this.readerStatus = readerStatus;
    this.baseTransmit = baseTransmit;
    this.onReaderStatusChange(readerStatus);
  }
}
