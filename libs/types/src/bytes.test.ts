import { asHexString, isByte } from './byte';

test('isByte', () => {
  expect(isByte(0)).toEqual(true);
  expect(isByte(10)).toEqual(true);
  expect(isByte(255)).toEqual(true);
  expect(isByte(0x00)).toEqual(true);
  expect(isByte(0x0a)).toEqual(true);
  expect(isByte(0xff)).toEqual(true);
  expect(isByte(-1)).toEqual(false);
  expect(isByte(256)).toEqual(false);
  expect(isByte(0x100)).toEqual(false);
  expect(isByte(3.14)).toEqual(false);
  expect(isByte(Infinity)).toEqual(false);
});

test('asHexString', () => {
  expect(asHexString(0x00)).toEqual('00');
  expect(asHexString(0x01)).toEqual('01');
  expect(asHexString(0x3f)).toEqual('3f');
});
