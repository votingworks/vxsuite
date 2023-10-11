import { PinLength } from './pin_length';

test('exactly', () => {
  const p = PinLength.exactly(4);
  expect(p.min).toEqual(4);
  expect(p.max).toEqual(4);
  expect(p.isFixed).toEqual(true);
});

test('range', () => {
  const p = PinLength.range(4, 6);
  expect(p.min).toEqual(4);
  expect(p.max).toEqual(6);
  expect(p.isFixed).toEqual(false);
});

test('invalid', () => {
  expect(() => PinLength.exactly(0)).toThrowError('min must be > 0');
  expect(() => PinLength.exactly(-1)).toThrowError('min must be > 0');
  expect(() => PinLength.range(0, 1)).toThrowError('min must be > 0');
  expect(() => PinLength.range(3, 1)).toThrowError('min must be <= max');
  expect(() => PinLength.exactly(1.5)).toThrowError('min must be an integer');
  expect(() => PinLength.range(1.5, 2)).toThrowError('min must be an integer');
  expect(() => PinLength.range(1, 2.5)).toThrowError('max must be an integer');
});
