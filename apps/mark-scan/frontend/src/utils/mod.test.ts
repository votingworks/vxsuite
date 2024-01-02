import { mod } from './mod';

test('calculates modulo for positive number', () => {
  expect(mod(5, 2)).toEqual(1);
});

test('returns absolute value of modulo for negative number', () => {
  expect(mod(-5, 2)).toEqual(1);
});
