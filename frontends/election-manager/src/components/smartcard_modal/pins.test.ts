import { isAllZeroSmartcardPinGenerationEnabled } from '@votingworks/ui';
import { mockOf } from '@votingworks/test-utils';

import { generatePin, hyphenatePin } from './pins';

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => {
  return {
    ...jest.requireActual('@votingworks/ui'),
    isAllZeroSmartcardPinGenerationEnabled: jest.fn(),
  };
});

beforeEach(() => {
  mockOf(isAllZeroSmartcardPinGenerationEnabled).mockImplementation(
    () => false
  );
});

test('generatePin generates PINs', () => {
  const digitRegex = new RegExp('^[0-9]+$');

  expect(generatePin().length).toEqual(6);
  expect(generatePin().match(digitRegex)).toBeTruthy();

  expect(generatePin(10).length).toEqual(10);
  expect(generatePin(10).match(digitRegex)).toBeTruthy();

  expect(() => generatePin(0)).toThrow('PIN length must be greater than 0');
  expect(() => generatePin(-1)).toThrow('PIN length must be greater than 0');
});

test('generatePIN generates PINs with all zeros when all-zero smartcard PIN generation feature flag is enabled', () => {
  mockOf(isAllZeroSmartcardPinGenerationEnabled).mockImplementation(() => true);

  expect(generatePin()).toEqual('000000');
  expect(generatePin(10)).toEqual('0000000000');
});

test('hyphenatePin hyphenates PINs', () => {
  expect(hyphenatePin('123456')).toEqual('123-456');
  expect(hyphenatePin('123456', 2)).toEqual('12-34-56');
  expect(hyphenatePin('123456', 4)).toEqual('1234-56');
  expect(hyphenatePin('123456', 6)).toEqual('123456');

  expect(() => hyphenatePin('123456', 0)).toThrow(
    'Segment length must be greater than 0'
  );
  expect(() => hyphenatePin('123456', -1)).toThrow(
    'Segment length must be greater than 0'
  );
});
