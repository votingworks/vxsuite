import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { prepareSignatureFile } from '@votingworks/auth';
import { WriteManifestOptions } from './types.js';
import { Backup } from '../backup.js';

/**
 * Writes a backup's manifest and the detached signature that authenticates it.
 * Every other file in the backup is covered by a hash within the manifest, so
 * signing the manifest signs the whole backup.
 */
export async function writeManifest(
  options: WriteManifestOptions
): Promise<void> {
  const { manifest, backup } = options;
  options.onProgressEvent?.({ type: 'writing_manifest' });

  const manifestFileContents = JSON.stringify(manifest, null, 2);
  await writeFile(
    new Backup(backup).manifestPath,
    manifestFileContents,
    'utf-8'
  );

  const signatureFile = await prepareSignatureFile({
    type: 'vxadmin_backup',
    context: 'export',
    manifestFileContents,
  });
  await writeFile(
    join(backup, signatureFile.fileName),
    signatureFile.fileContents
  );
}
