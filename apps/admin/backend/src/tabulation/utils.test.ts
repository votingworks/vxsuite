import { isBlankSheet } from './utils';

test('isBlankSheet', () => {
  expect(isBlankSheet({})).toEqual(true);
  expect(isBlankSheet({ contest: [] })).toEqual(true);
  expect(isBlankSheet({ contest: ['id'] })).toEqual(false);
});
