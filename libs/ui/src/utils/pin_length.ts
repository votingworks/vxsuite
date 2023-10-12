import { assert } from '@votingworks/basics';

/**
 * Represents a range of possible PIN lengths.
 */
export class PinLength {
  private constructor(
    private readonly minimum: number,
    private readonly maximum: number
  ) {
    assert(minimum > 0, 'min must be > 0');
    assert(minimum <= maximum, 'min must be <= max');
    assert(Number.isInteger(minimum), 'min must be an integer');
    assert(Number.isInteger(maximum), 'max must be an integer');
  }

  /**
   * Create a new `PinLength` representing an inclusive range of possible PIN
   * lengths.
   *
   * @param min The minimum length of the PIN.
   * @param max The maximum length of the PIN.
   */
  static range(min: number, max: number): PinLength {
    return new PinLength(min, max);
  }

  /**
   * Create a new `PinLength` representing a fixed-length PIN.
   */
  static exactly(length: number): PinLength {
    return new PinLength(length, length);
  }

  /**
   * The minimum length of the PIN.
   */
  get min(): number {
    return this.minimum;
  }

  /**
   * The maximum length of the PIN.
   */
  get max(): number {
    return this.maximum;
  }

  /**
   * Whether the PIN length is fixed.
   */
  get isFixed(): boolean {
    return this.minimum === this.maximum;
  }
}
