import { isTouchSizeMode } from '.';

test('isTouchSizeMode', () => {
  expect(isTouchSizeMode('desktop')).toEqual(false);
  expect(isTouchSizeMode('touchSmall')).toEqual(true);
  expect(isTouchSizeMode('touchMedium')).toEqual(true);
  expect(isTouchSizeMode('touchLarge')).toEqual(true);
  expect(isTouchSizeMode('touchExtraLarge')).toEqual(true);
});
