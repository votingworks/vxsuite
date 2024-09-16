import { Buffer } from 'node:buffer';
import CombinedStream from 'combined-stream';
import { Stream } from 'node:stream';

const MESSAGE_FORMAT_VERSION = 1;
const MESSAGE_SEPARATOR = '//';

/**
 * Constructs a prefixed message to be signed, the prefix ensuring that signatures are
 * domain-separated
 */
export function constructPrefixedMessage(
  messageType: string,
  messagePayload: string
): string;
export function constructPrefixedMessage( // eslint-disable-line vx/gts-jsdoc
  messageType: string,
  messagePayload: Buffer | NodeJS.ReadableStream
): Stream;
export function constructPrefixedMessage( // eslint-disable-line vx/gts-jsdoc
  messageType: string,
  messagePayload: string | Buffer | NodeJS.ReadableStream
): string | Stream {
  const messagePrefix = [
    MESSAGE_FORMAT_VERSION,
    MESSAGE_SEPARATOR,
    messageType,
    MESSAGE_SEPARATOR,
  ].join('');
  if (typeof messagePayload === 'string') {
    return `${messagePrefix}${messagePayload}`;
  }
  const message = CombinedStream.create();
  message.append(messagePrefix);
  message.append(messagePayload);
  return message;
}
