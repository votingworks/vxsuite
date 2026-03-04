import { describe, it, expect } from 'vitest';
import { isValidIpv4Address } from './utils';

describe('isValidIpv4Address', () => {
  it('returns true for valid IPv4 addresses', () => {
    expect(isValidIpv4Address('192.168.1.1')).toBe(true);
    expect(isValidIpv4Address('0.0.0.0')).toBe(true);
    expect(isValidIpv4Address('255.255.255.255')).toBe(true);
    expect(isValidIpv4Address('10.0.0.1')).toBe(true);
  });

  it('returns true for localhost', () => {
    expect(isValidIpv4Address('localhost')).toBe(true);
  });

  it('returns false for invalid addresses', () => {
    expect(isValidIpv4Address('256.0.0.1')).toBe(false);
    expect(isValidIpv4Address('1.2.3')).toBe(false);
    expect(isValidIpv4Address('1.2.3.4.5')).toBe(false);
    expect(isValidIpv4Address('')).toBe(false);
    expect(isValidIpv4Address('abc.def.ghi.jkl')).toBe(false);
    expect(isValidIpv4Address('::1')).toBe(false);
  });
});
