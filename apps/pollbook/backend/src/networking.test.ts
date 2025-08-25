import { test, expect } from 'vitest';
import { getNodeServiceName, isValidIpv4Address } from './networking';

test('isValidIpv4Address', () => {
  expect(isValidIpv4Address('192.168.1.1')).toEqual(true);
  expect(isValidIpv4Address('256.256.256.256')).toEqual(false);
  expect(isValidIpv4Address('invalid-ip')).toEqual(false);
  expect(isValidIpv4Address('localhost')).toEqual(true);
  expect(isValidIpv4Address('')).toEqual(false);
  expect(isValidIpv4Address('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toEqual(
    false
  );
});

test('getNodeServiceName', () => {
  expect(getNodeServiceName('machine-1')).toEqual('Pollbook-machine-1');
});
