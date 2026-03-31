import { Buffer } from 'node:buffer';
import { describe, expect, test } from 'vitest';

import { signManifest, validateManifestSignature } from './signing';

describe('signManifest', () => {
  test('produces a signature with the dev HMAC prefix', () => {
    const sig = signManifest('{"test":true}');
    expect(sig.toString()).toMatch(/^VXBACKUP_DEV_HMAC_V1:/);
  });
});

describe('validateManifestSignature', () => {
  test('accepts a valid HMAC signature', () => {
    const json = '{"version":1}';
    const sig = signManifest(json);
    expect(validateManifestSignature(json, sig)).toEqual(true);
  });

  test('rejects a tampered manifest', () => {
    const sig = signManifest('{"original":true}');
    expect(validateManifestSignature('{"tampered":true}', sig)).toEqual(false);
  });

  test('accepts legacy dev placeholder signature', () => {
    const json = '{"legacy":true}';
    const sig = Buffer.from('DEV_PLACEHOLDER_SIGNATURE');
    expect(validateManifestSignature(json, sig)).toEqual(true);
  });

  test('rejects unknown signature format', () => {
    const json = '{"test":true}';
    const sig = Buffer.from('UNKNOWN_FORMAT:abc123');
    expect(validateManifestSignature(json, sig)).toEqual(false);
  });
});
