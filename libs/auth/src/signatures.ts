import { Buffer } from 'node:buffer';
import CombinedStream from 'combined-stream';

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
): CombinedStream;
export function constructPrefixedMessage( // eslint-disable-line vx/gts-jsdoc
  messageType: string,
  messagePayload: string | Buffer | NodeJS.ReadableStream
): string | CombinedStream {
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

/**
 * Deconstructs a prefixed message into its components
 */
export function deconstructPrefixedMessage(prefixedMessage: string): {
  messageType: string;
  messagePayload: string;
} {
  const parts = prefixedMessage.split(MESSAGE_SEPARATOR);

  if (parts.length < 3 || parts[0] !== MESSAGE_FORMAT_VERSION.toString()) {
    throw new Error('Invalid prefixed message format');
  }

  return {
    messageType: parts[1] as string,
    messagePayload: parts[2] as string,
  };
}
