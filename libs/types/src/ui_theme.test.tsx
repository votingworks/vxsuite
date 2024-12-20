import { isTouchSizeMode, isTouchscreen } from '.';

test('isTouchSizeMode', () => {
  expect(isTouchSizeMode('desktop')).toEqual(false);
  expect(isTouchSizeMode('touchSmall')).toEqual(true);
  expect(isTouchSizeMode('touchMedium')).toEqual(true);
  expect(isTouchSizeMode('touchLarge')).toEqual(true);
  expect(isTouchSizeMode('touchExtraLarge')).toEqual(true);
});

test('isTouchscreen', () => {
  expect(isTouchscreen('elo13')).toEqual(true);
  expect(isTouchscreen('elo15')).toEqual(true);
  expect(isTouchscreen('lenovoThinkpad15')).toEqual(false);
  expect(isTouchscreen('builtIn')).toEqual(false);
});
