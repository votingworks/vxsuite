/**
 * generatePin generates a random numeric PIN of the specified length (default = 6)
 */
export function generatePin(length = 6): string {
  if (length < 1) {
    throw new Error('PIN length must be greater than 0');
  }

  let pin = '';
  for (let i = 0; i < length; i += 1) {
    pin += `${Math.floor(Math.random() * 10)}`;
  }
  return pin;
}

/**
 * hyphenatePin adds hyphens to the provided pin, creating segments of the specified length
 * (default = 3), e.g. turning '123456' into '123-456'
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
