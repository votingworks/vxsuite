import randomBytes from 'randombytes';
import { BooleanEnvironmentVariableName } from './environment_variable';
import { isFeatureFlagEnabled } from './features';

/** See VVSG 2.0 - 11.3.2-B – Password complexity */
export const MIN_PIN_LENGTH = 6;

/** Maximum reasonable PIN length for user memorization. */
export const MAX_PIN_LENGTH = 16;

/** Minimum number of unique digits required in a non-weak PIN. */
const MIN_UNIQUE_DIGITS = 3;

/** Max number of times a digit can repeat, uninterrupted, in a non-weak PIN. */
const MAX_DIGIT_REPETITION = 3;

/** Max length of sequential string of digits allowed in a non-weak PIN. */
const MAX_SEQUENTIAL_DIGITS = 3;

/** Long strings of repeated digits that contribute to a weak PIN. */
const REPEATED_DIGIT_SUBSTRINGS: string[] = ((): string[] => {
  const repeatedDigitSubstrings: string[] = [];

  for (let digit = 0; digit < 10; digit += 1) {
    repeatedDigitSubstrings.push(`${digit}`.repeat(MAX_DIGIT_REPETITION + 1));
  }

  return repeatedDigitSubstrings;
})();

/** Digit patterns that we consider to contribute to a weak PIN. */
const SEQUENTIAL_DIGIT_SUBSTRINGS: string[] = ((): string[] => {
  const sequentialDigitSubstrings: string[] = [];

  for (let digit = MAX_SEQUENTIAL_DIGITS; digit < 10; digit += 1) {
    const descendingSequence = Array.from({ length: MAX_SEQUENTIAL_DIGITS + 1 })
      .fill(0)
      .map((_element, index) => digit - index);

    sequentialDigitSubstrings.push(descendingSequence.join(''));
    sequentialDigitSubstrings.push(descendingSequence.reverse().join(''));
  }

  return sequentialDigitSubstrings;
})();

function newRandomPin(length: number): string {
  const bytes = randomBytes(length);
  let pin = '';
  for (let i = 0; i < length; i += 1) {
    const nextDigit = (bytes[i] as number) % 10;
    pin += `${nextDigit}`;
  }
  return pin;
}

/** Returns true if the given PIN contains common/easily guessed patterns. */
function isWeakPin(pin: string): boolean {
  // Not enough digit variety:
  if (new Set(pin).size < MIN_UNIQUE_DIGITS) {
    return true;
  }

  // Contains long strings of repeated digits:
  for (const repeatedDigitSubstring of REPEATED_DIGIT_SUBSTRINGS) {
    if (pin.includes(repeatedDigitSubstring)) {
      return true;
    }
  }

  // Contains long strings of sequential digits:
  for (const sequentialDigitSubstring of SEQUENTIAL_DIGIT_SUBSTRINGS) {
    if (pin.includes(sequentialDigitSubstring)) {
      return true;
    }
  }

  return false;
}

/**
 * generatePin generates random numeric PINs of the specified length (default = 6).
 *
 * When the all-zero smart card PINs feature flag is enabled, generatePin generates PINs with all
 * zeros.
 */
export function generatePin(length = MIN_PIN_LENGTH): string {
  if (length < MIN_PIN_LENGTH) {
    throw new Error(
      `PIN length must be greater than or equal to ${MIN_PIN_LENGTH}`
    );
  }

  if (length > MAX_PIN_LENGTH) {
    throw new Error(
      `PIN length must be less than or equal to ${MAX_PIN_LENGTH}`
    );
  }

  if (
    isFeatureFlagEnabled(BooleanEnvironmentVariableName.ALL_ZERO_SMARTCARD_PIN)
  ) {
    return '0'.repeat(length);
  }

  let pin: string;
  do {
    pin = newRandomPin(length);
  } while (isWeakPin(pin));

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
