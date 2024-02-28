import { assertDefined } from './assert';

/**
 * Models a date only (no time). This is safer to use than a Date object when
 * you want to represent a date only, since there is no timezone involved.
 *
 * Usage:
 *   const date = new DateWithoutTime('2024-02-26');
 *   console.log(date.toISOString()); // '2021-02-26'
 *   console.log(date.toMidnightDatetimeWithSystemTimezone().toDateString()); // 'Mon Feb 26 2024'
 */
export class DateWithoutTime {
  /**
   * Create a new DateWithoutTime object from a string in the format YYYY-MM-DD.
   */
  constructor(private readonly dateString: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      throw new Error('Date must be in the format YYYY-MM-DD');
    }
  }

  /**
   * Create a new DateWithoutTime object for the current date.
   */
  static today(): DateWithoutTime {
    return new DateWithoutTime(
      assertDefined(new Date().toISOString().split('T')[0])
    );
  }

  /**
   * Convert this date to a Date object with the time set to midnight in the
   * system's timezone. This is safe to use when you want to format the date to
   * show to a user, since the basic JS date formatting methods (e.g.
   * Date.toDateString and Intl.DateTimeFormat) will use the system's timezone
   * by default.
   *
   * For example, if you use a JS Date object to parse a date string, you may
   * get an off-by-one error if the system timezone is not UTC:
   *
   *    const date = new Date('2024-02-26');
   *    console.log(date.toDateString()); // 'Sun Feb 25 2024'
   *
   * Whereas if you use this method, you will get the correct date:
   *
   *    const date = new DateWithoutTime('2024-02-26');
   *    console.log(date.toMidnightDatetimeWithSystemTimezone().toDateString()); // 'Mon Feb 26 2024'
   *
   */
  toMidnightDatetimeWithSystemTimezone(): Date {
    return new Date(`${this.dateString}T00:00:00`);
  }

  /**
   * Convert this date to a string in the format YYYY-MM-DD.
   */
  toISOString(): string {
    return this.dateString;
  }

  /**
   * Compare this date to another DateWithoutTime object. Returns true if they
   * represent the same date, false otherwise.
   */
  isEqual(other: DateWithoutTime): boolean {
    return this.dateString === other.dateString;
  }

  /**
   * A string representation of this object, useful for debugging.
   */
  toString(): string {
    return `DateWithoutTime(${this.dateString})`;
  }

  /**
   * Serialize the date for JSON representation using `toISOString()`.
   */
  toJSON(): string {
    return this.toISOString();
  }
}
