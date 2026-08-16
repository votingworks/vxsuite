import fc from 'fast-check';
import { DateTime } from 'luxon';

export function arbitraryDateTime({
  minYear,
  maxYear,
  zoneName,
}: {
  minYear?: number;
  maxYear?: number;
  zoneName?: DateTime['zoneName'];
} = {}): fc.Arbitrary<DateTime> {
  return fc
    .record({
      year: fc.integer({ min: minYear, max: maxYear }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 31 }),
      hour: fc.integer({ min: 0, max: 23 }),
      minute: fc.integer({ min: 0, max: 59 }),
      second: fc.integer({ min: 0, max: 59 }),
    })
    .map((parts) => {
      try {
        const result = DateTime.fromObject(parts, {
          zone: zoneName,
        });
        /* istanbul ignore else */
        if (
          result.year === parts.year &&
          result.month === parts.month &&
          result.day === parts.day &&
          result.hour === parts.hour &&
          result.minute === parts.minute &&
          result.second === parts.second
        ) {
          return result;
        }
      } catch {
        // ignore invalid dates
      }
      /* istanbul ignore next */
      return undefined;
    })
    .filter((dateTime): dateTime is DateTime => !!dateTime);
}
