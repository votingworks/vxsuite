import { markClassName } from './mark_class_name';

test('no mark', () => {
  expect(markClassName(0, { marginal: 0.05, definite: 0.09 })).toBe('no-mark');
  expect(markClassName(0.0049, { marginal: 0.05, definite: 0.09 })).toBe(
    'no-mark'
  );
});

test('minimal mark', () => {
  expect(markClassName(0.02, { marginal: 0.05, definite: 0.09 })).toBe(
    'minimal-mark'
  );
  expect(markClassName(0.0249, { marginal: 0.05, definite: 0.09 })).toBe(
    'minimal-mark'
  );
  expect(markClassName(0.005, { marginal: 0.05, definite: 0.09 })).toBe(
    'minimal-mark'
  );
});

test('submarginal mark', () => {
  expect(markClassName(0.049, { marginal: 0.05, definite: 0.09 })).toBe(
    'submarginal-mark'
  );
  expect(markClassName(0.025, { marginal: 0.05, definite: 0.09 })).toBe(
    'submarginal-mark'
  );
});

test('marginal mark', () => {
  expect(markClassName(0.05, { marginal: 0.05, definite: 0.09 })).toBe(
    'marginal-mark'
  );
  expect(markClassName(0.08, { marginal: 0.05, definite: 0.09 })).toBe(
    'marginal-mark'
  );
  expect(markClassName(0.089, { marginal: 0.05, definite: 0.09 })).toBe(
    'marginal-mark'
  );
});

test('definite mark', () => {
  expect(markClassName(0.09, { marginal: 0.05, definite: 0.09 })).toBe(
    'definite-mark'
  );
  expect(markClassName(1, { marginal: 0.05, definite: 0.09 })).toBe(
    'definite-mark'
  );
});
