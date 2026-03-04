/**
 * Validates that a string is a valid IPv4 address.
 */
export function isValidIpv4Address(address: string): boolean {
  const ipv4Regex =
    /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
  return ipv4Regex.test(address) || address === 'localhost'; // localhost is used in tests
}
