import { isAllZeroSmartcardPinGenerationEnabled } from '../../config/features';

/**
 * generatePin generates random numeric PINs of the specified length (default = 6).
 *
 * When the all-zero smartcard PINs feature flag is enabled, generatePin generates PINs with all
 * zeros.
 */
export function generatePin(length = 6): string {
  if (length < 1) {
    throw new Error('PIN length must be greater than 0');
  }

  let pin = '';
  for (let i = 0; i < length; i += 1) {
    const nextDigit = isAllZeroSmartcardPinGenerationEnabled()
      ? 0
      : Math.floor(Math.random() * 10);
    pin += `${nextDigit}`;
  }
  return pin;
}

/**
 * hyphenatePin adds hyphens to the provided PIN, creating segments of the specified length
 * (default = 3), e.g. turning '123456' into '123-456'.
 */
export function hyphenatePin(pin: string, segmentLength = 3): string {
  if (segmentLength < 1) {
    throw new Error('Segment length must be greater than 0');
  }

  const segments: string[] = [];
  for (let i = 0; i < pin.length; i += segmentLength) {
    segments.push(pin.substring(i, i + segmentLength));
  }
  return segments.join('-');
}
