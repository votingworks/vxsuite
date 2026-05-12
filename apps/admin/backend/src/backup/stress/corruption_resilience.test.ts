import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { describe, expect, test } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';

import { validateBackup } from '../backup';
import { signManifest } from '../signing';
import {
  BACKUP_IMAGES_DIR,
  BACKUP_ROOT_DIR,
  BackupManifest,
  MANIFEST_FILENAME,
  MANIFEST_SIGNATURE_FILENAME,
  BACKUP_DB_FILENAME,
} from '../types';
import {
  backupAndValidate,
  createPopulatedWorkspace,
} from './workspace_factory';

describe('corruption resilience', () => {
  test('rejects tampered manifest (modified after signing)', async () => {
    const mountPoint = makeTemporaryDirectory();
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 1,
      imagesPerCvr: 1,
    });
    const { backupDirName } = await backupAndValidate(workspace, mountPoint);
    const backupDir = join(mountPoint, BACKUP_ROOT_DIR, backupDirName);

    const manifestPath = join(backupDir, MANIFEST_FILENAME);
    const manifestJson = await readFile(manifestPath, 'utf-8');
    const manifest: BackupManifest = JSON.parse(manifestJson);
    manifest.electionTitle = 'TAMPERED TITLE';
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    const result = await validateBackup(backupDir);
    if (result.isOk()) {
      throw new Error('Expected validateBackup to return an error');
    }
    expect(result.err().type).toEqual('invalidManifestSignature');
  });

  test('rejects truncated data.db', async () => {
    const mountPoint = makeTemporaryDirectory();
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 1,
      imagesPerCvr: 0,
    });
    const { backupDirName } = await backupAndValidate(workspace, mountPoint);
    const backupDir = join(mountPoint, BACKUP_ROOT_DIR, backupDirName);

    const dbPath = join(backupDir, BACKUP_DB_FILENAME);
    await writeFile(dbPath, Buffer.alloc(10));

    const result = await validateBackup(backupDir);
    if (result.isOk()) {
      throw new Error('Expected validateBackup to return an error');
    }
    const error = result.err();
    expect(error.type).toEqual('invalidFileHash');
    if (error.type === 'invalidFileHash') {
      expect(error.path).toEqual(BACKUP_DB_FILENAME);
    }
  });

  test('rejects missing ballot image referenced in manifest', async () => {
    const mountPoint = makeTemporaryDirectory();
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 3,
      imagesPerCvr: 1,
    });
    const { manifest, backupDirName } = await backupAndValidate(
      workspace,
      mountPoint
    );
    const backupDir = join(mountPoint, BACKUP_ROOT_DIR, backupDirName);

    const imageFile = assertDefined(
      manifest.files.find((f) => f.path.startsWith(BACKUP_IMAGES_DIR))
    );
    await unlink(join(backupDir, imageFile.path));

    await expect(validateBackup(backupDir)).rejects.toThrow('ENOENT');
  });

  test('rejects corrupt signature file', async () => {
    const mountPoint = makeTemporaryDirectory();
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 1,
      imagesPerCvr: 0,
    });
    const { backupDirName } = await backupAndValidate(workspace, mountPoint);
    const backupDir = join(mountPoint, BACKUP_ROOT_DIR, backupDirName);

    const sigPath = join(backupDir, MANIFEST_SIGNATURE_FILENAME);
    await writeFile(sigPath, 'garbage-signature-data');

    const result = await validateBackup(backupDir);
    if (result.isOk()) {
      throw new Error('Expected validateBackup to return an error');
    }
    expect(result.err().type).toEqual('invalidManifestSignature');
  });

  test('rejects garbage JSON in manifest', async () => {
    const mountPoint = makeTemporaryDirectory();
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 1,
      imagesPerCvr: 0,
    });
    const { backupDirName } = await backupAndValidate(workspace, mountPoint);
    const backupDir = join(mountPoint, BACKUP_ROOT_DIR, backupDirName);

    const garbageContent = 'not valid json{[';
    const manifestPath = join(backupDir, MANIFEST_FILENAME);
    const sigPath = join(backupDir, MANIFEST_SIGNATURE_FILENAME);
    await writeFile(manifestPath, garbageContent, 'utf-8');
    await writeFile(sigPath, signManifest(garbageContent));

    const result = await validateBackup(backupDir);
    if (result.isOk()) {
      throw new Error('Expected validateBackup to return an error');
    }
    expect(result.err().type).toEqual('error');
  });

  test('rejects zero-byte data.db', async () => {
    const mountPoint = makeTemporaryDirectory();
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 1,
      imagesPerCvr: 0,
    });
    const { backupDirName } = await backupAndValidate(workspace, mountPoint);
    const backupDir = join(mountPoint, BACKUP_ROOT_DIR, backupDirName);

    const dbPath = join(backupDir, BACKUP_DB_FILENAME);
    await writeFile(dbPath, Buffer.alloc(0));

    const result = await validateBackup(backupDir);
    if (result.isOk()) {
      throw new Error('Expected validateBackup to return an error');
    }
    expect(result.err().type).toEqual('invalidFileHash');
  });

  test('validates backup with extra unexpected files', async () => {
    const mountPoint = makeTemporaryDirectory();
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 1,
      imagesPerCvr: 1,
    });
    const { backupDirName } = await backupAndValidate(workspace, mountPoint);
    const backupDir = join(mountPoint, BACKUP_ROOT_DIR, backupDirName);

    await writeFile(join(backupDir, 'extra.txt'), 'unexpected file');
    await writeFile(
      join(backupDir, BACKUP_IMAGES_DIR, 'spurious.jpg'),
      'not a real image'
    );

    const manifest = (await validateBackup(backupDir)).unsafeUnwrap();
    expect(manifest.files.length).toBeGreaterThan(0);
  });

  test('rejects manifest with wrong file hashes', async () => {
    const mountPoint = makeTemporaryDirectory();
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 1,
      imagesPerCvr: 0,
    });
    const { backupDirName } = await backupAndValidate(workspace, mountPoint);
    const backupDir = join(mountPoint, BACKUP_ROOT_DIR, backupDirName);

    const manifestPath = join(backupDir, MANIFEST_FILENAME);
    const sigPath = join(backupDir, MANIFEST_SIGNATURE_FILENAME);
    const manifestJson = await readFile(manifestPath, 'utf-8');
    const manifest: BackupManifest = JSON.parse(manifestJson);

    const dbFile = assertDefined(
      manifest.files.find((f) => f.path === BACKUP_DB_FILENAME)
    );
    dbFile.sha256 = 'aa'.repeat(32);

    const modifiedJson = JSON.stringify(manifest, null, 2);
    await writeFile(manifestPath, modifiedJson, 'utf-8');
    await writeFile(sigPath, signManifest(modifiedJson));

    const result = await validateBackup(backupDir);
    if (result.isOk()) {
      throw new Error('Expected validateBackup to return an error');
    }
    expect(result.err().type).toEqual('invalidFileHash');
  });

  // Current implementation only verifies file hashes, not sizes. A manifest
  // with incorrect sizes but correct hashes passes validation.
  test('accepts manifest with wrong file sizes but correct hashes', async () => {
    const mountPoint = makeTemporaryDirectory();
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 1,
      imagesPerCvr: 0,
    });
    const { backupDirName } = await backupAndValidate(workspace, mountPoint);
    const backupDir = join(mountPoint, BACKUP_ROOT_DIR, backupDirName);

    const manifestPath = join(backupDir, MANIFEST_FILENAME);
    const sigPath = join(backupDir, MANIFEST_SIGNATURE_FILENAME);
    const manifestJson = await readFile(manifestPath, 'utf-8');
    const manifest: BackupManifest = JSON.parse(manifestJson);

    const dbFile = assertDefined(
      manifest.files.find((f) => f.path === BACKUP_DB_FILENAME)
    );
    dbFile.size = 999999;

    const modifiedJson = JSON.stringify(manifest, null, 2);
    await writeFile(manifestPath, modifiedJson, 'utf-8');
    await writeFile(sigPath, signManifest(modifiedJson));

    const validatedManifest = (await validateBackup(backupDir)).unsafeUnwrap();
    expect(validatedManifest.files).toEqual(manifest.files);
  });
});
