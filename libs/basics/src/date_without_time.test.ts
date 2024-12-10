import { describe, expect, test } from 'vitest';
import { DateWithoutTime } from './date_without_time';

describe('DateWithoutTime', () => {
  test('constructor', () => {
    expect(new DateWithoutTime('2024-02-26').toISOString()).toEqual(
      '2024-02-26'
    );
    expect(() => new DateWithoutTime('2024-2-26')).toThrowError(
      'Date must be in the format YYYY-MM-DD'
    );
    expect(() => new DateWithoutTime('2024-02-26T00:00:00')).toThrowError(
      'Date must be in the format YYYY-MM-DD'
    );
    expect(() => new DateWithoutTime('2024-02-26T00:00:00Z')).toThrowError(
      'Date must be in the format YYYY-MM-DD'
    );
  });

  test('today', () => {
    expect(DateWithoutTime.today().toISOString()).toEqual(
      new Date().toISOString().split('T')[0]
    );
  });

  test('toMidnightDatetimeWithSystemTimezone', () => {
    const date = new DateWithoutTime('2024-02-26');
    const midnightDatetime = date.toMidnightDatetimeWithSystemTimezone();
    expect(midnightDatetime.toDateString()).toEqual('Mon Feb 26 2024');
    // Construct the expected date a different way than
    // toMidnightDatetimeWithSystemTimezone does this internally in order to
    // actually test it.
    const expectedDate = new Date();
    expectedDate.setFullYear(2024);
    // Set date to 1 before setting month, since setMonth depends on the date
    // value. According to MDN docs: "Conceptually it will add the number of
    // days given by the current day of the month to the 1st day of the new
    // month specified as the parameter, to return the new date."
    expectedDate.setDate(1);
    // Months are weirdly 0-indexed
    expectedDate.setMonth(1);
    expectedDate.setDate(26);
    expectedDate.setHours(0);
    expectedDate.setMinutes(0);
    expectedDate.setSeconds(0);
    expectedDate.setMilliseconds(0);
    expect(midnightDatetime.toISOString()).toEqual(expectedDate.toISOString());
  });

  test('isEqual', () => {
    const date = new DateWithoutTime('2024-02-26');
    expect(date.isEqual(new DateWithoutTime('2024-02-26'))).toEqual(true);
    expect(date.isEqual(new DateWithoutTime('2024-02-27'))).toEqual(false);
  });

  test('toString', () => {
    expect(new DateWithoutTime('2024-02-26').toString()).toEqual(
      'DateWithoutTime(2024-02-26)'
    );
  });

  test('toJSON', () => {
    expect(new DateWithoutTime('2024-02-26').toJSON()).toEqual('2024-02-26');
    expect(JSON.stringify(new DateWithoutTime('2024-02-26'))).toEqual(
      '"2024-02-26"'
    );
  });
});
