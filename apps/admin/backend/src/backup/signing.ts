import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import makeDebug from 'debug';

const debug = makeDebug('admin:backup:signing');

/**
 * A shared secret used for HMAC signing in development mode.
 * In production, this will be replaced with TPM-backed keys via the
 * artifact authentication system.
 */
const DEV_HMAC_KEY = 'vxadmin-backup-dev-signing-key';

const DEV_SIGNATURE_PREFIX = 'VXBACKUP_DEV_HMAC_V1:';

/**
 * Sign a manifest JSON string and return the signature as a Buffer.
 *
 * Currently uses HMAC-SHA256 for tamper detection. Will be replaced with
 * the artifact authentication system (TPM-backed keys, vxsig format).
 */
export function signManifest(manifestJson: string): Buffer {
  const hmac = createHmac('sha256', DEV_HMAC_KEY);
  hmac.update(manifestJson);
  const signature = hmac.digest('hex');
  return Buffer.from(`${DEV_SIGNATURE_PREFIX}${signature}`);
}

/**
 * Validate a manifest signature. Returns true if valid.
 *
 * Currently validates the HMAC-SHA256 signature. Will be updated to
 * validate the full certificate chain and vxsig signature.
 */
export function validateManifestSignature(
  manifestJson: string,
  signatureData: Buffer
): boolean {
  const sigString = signatureData.toString();

  // Handle dev HMAC signatures
  if (sigString.startsWith(DEV_SIGNATURE_PREFIX)) {
    const expectedHmac = createHmac('sha256', DEV_HMAC_KEY);
    expectedHmac.update(manifestJson);
    const expectedSignature = expectedHmac.digest('hex');
    const actualSignature = sigString.slice(DEV_SIGNATURE_PREFIX.length);

    if (expectedSignature !== actualSignature) {
      debug('HMAC signature mismatch');
      return false;
    }
    return true;
  }

  // Handle legacy dev placeholder
  if (sigString === 'DEV_PLACEHOLDER_SIGNATURE') {
    debug('accepting legacy dev placeholder signature');
    return true;
  }

  // TODO: Add vxsig validation
  debug('unknown signature format');
  return false;
}
