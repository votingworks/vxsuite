import { describe, it, expect } from 'vitest';
import { isValidIpv4Address } from './utils';

describe('isValidIpv4Address', () => {
  it('returns true for valid IPv4 addresses', () => {
    expect(isValidIpv4Address('192.168.1.1')).toEqual(true);
    expect(isValidIpv4Address('0.0.0.0')).toEqual(true);
    expect(isValidIpv4Address('255.255.255.255')).toEqual(true);
    expect(isValidIpv4Address('169.254.1.100')).toEqual(true);
  });

  it('returns false for invalid addresses', () => {
    expect(isValidIpv4Address('256.1.1.1')).toEqual(false);
    expect(isValidIpv4Address('1.2.3')).toEqual(false);
    expect(isValidIpv4Address('1.2.3.4.5')).toEqual(false);
    expect(isValidIpv4Address('abc.def.ghi.jkl')).toEqual(false);
    expect(isValidIpv4Address('')).toEqual(false);
  });

  it('accepts localhost for testing', () => {
    expect(isValidIpv4Address('localhost')).toEqual(true);
  });
});
