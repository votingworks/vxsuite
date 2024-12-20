import fc from 'fast-check';
import { safeParseInt, safeParseNumber } from './numeric';

function isNotNegativeZero(value: number): boolean {
  return !Object.is(value, -0);
}

test('safeParseNumber', () => {
  expect(safeParseNumber('abc').unsafeUnwrapErr().issues).toEqual([
    expect.objectContaining({ code: 'invalid_type' }),
  ]);

  expect(safeParseNumber({}).unsafeUnwrapErr().issues).toEqual([
    expect.objectContaining({ code: 'invalid_type' }),
  ]);

  expect(safeParseNumber(Infinity).unsafeUnwrapErr().issues).toEqual([
    expect.objectContaining({ message: 'Infinity is not allowed' }),
  ]);

  expect(safeParseNumber(-Infinity).unsafeUnwrapErr().issues).toEqual([
    expect.objectContaining({ message: 'Infinity is not allowed' }),
  ]);

  fc.assert(
    fc.property(
      fc
        .double({ next: true, noNaN: true, noDefaultInfinity: true })
        .filter(isNotNegativeZero),
      (number) => {
        // parse number
        expect(safeParseNumber(number).unsafeUnwrap()).toEqual(number);

        // parse string
        expect(safeParseNumber(number.toString()).unsafeUnwrap()).toEqual(
          number
        );

        // bounds checking
        if (Math.abs(number) < Number.MAX_SAFE_INTEGER) {
          expect(
            safeParseNumber(number, { min: number }).unsafeUnwrap()
          ).toEqual(number);

          expect(
            safeParseNumber(number, { max: number }).unsafeUnwrap()
          ).toEqual(number);

          expect(
            safeParseNumber(number, { min: number, max: number }).unsafeUnwrap()
          ).toEqual(number);

          expect(
            safeParseNumber(number, { min: number + 1 }).unsafeUnwrapErr()
              .issues
          ).toEqual([expect.objectContaining({ code: 'too_small' })]);

          expect(
            safeParseNumber(number, { max: number - 1 }).unsafeUnwrapErr()
              .issues
          ).toEqual([expect.objectContaining({ code: 'too_big' })]);
        }
      }
    )
  );
});

test('safeParseInt', () => {
  expect(safeParseInt('abc').unsafeUnwrapErr().issues).toEqual([
    expect.objectContaining({ code: 'invalid_type' }),
  ]);

  expect(safeParseInt({}).unsafeUnwrapErr().issues).toEqual([
    expect.objectContaining({ code: 'invalid_type' }),
  ]);

  expect(safeParseInt(Infinity).unsafeUnwrapErr().issues).toContainEqual(
    expect.objectContaining({ message: 'Infinity is not allowed' })
  );

  expect(safeParseInt(-Infinity).unsafeUnwrapErr().issues).toContainEqual(
    expect.objectContaining({ message: 'Infinity is not allowed' })
  );

  fc.assert(
    fc.property(
      fc
        .double({ next: true, noNaN: true, noDefaultInfinity: true })
        .filter(
          (number) => isNotNegativeZero(number) && !Number.isInteger(number)
        ),
      (number) => {
        expect(safeParseInt(number).unsafeUnwrapErr().issues).toEqual([
          expect.objectContaining({
            message: 'Expected integer, received float',
          }),
        ]);
      }
    )
  );

  fc.assert(
    fc.property(fc.integer().filter(isNotNegativeZero), (number) => {
      expect(safeParseInt(number).unsafeUnwrap()).toEqual(number);
      expect(safeParseInt(number.toString()).unsafeUnwrap()).toEqual(number);

      // bounds checking
      if (Math.abs(number) < Number.MAX_SAFE_INTEGER) {
        expect(safeParseInt(number, { min: number }).unsafeUnwrap()).toEqual(
          number
        );

        expect(safeParseInt(number, { max: number }).unsafeUnwrap()).toEqual(
          number
        );

        expect(
          safeParseInt(number, { min: number, max: number }).unsafeUnwrap()
        ).toEqual(number);

        expect(
          safeParseInt(number, { min: number + 1 }).unsafeUnwrapErr().issues
        ).toEqual([expect.objectContaining({ code: 'too_small' })]);

        expect(
          safeParseInt(number, { max: number - 1 }).unsafeUnwrapErr().issues
        ).toEqual([expect.objectContaining({ code: 'too_big' })]);
      }
    })
  );
});
