import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { describe, expect, test, vi } from 'vitest';
import { err } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';

import { performRestore } from './restore';
import { signManifest } from './signing';
import {
  BACKUP_DB_FILENAME,
  BACKUP_IMAGES_DIR,
  BACKUP_ROOT_DIR,
  BackupManifest,
  MANIFEST_FILENAME,
  MANIFEST_SIGNATURE_FILENAME,
} from './types';
import {
  WORKSPACE_BALLOT_IMAGES_DIR,
  WORKSPACE_DB_FILENAME,
} from '../util/workspace';

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

async function createBackup(
  mountPoint: string,
  dirName: string,
  options: {
    images?: Array<{ relPath: string; content: string }>;
    softwareVersion?: string;
  } = {}
): Promise<string> {
  const backupRoot = join(mountPoint, BACKUP_ROOT_DIR);
  await mkdir(backupRoot, { recursive: true });
  const backupDir = join(backupRoot, dirName);
  await mkdir(backupDir, { recursive: true });
  await mkdir(join(backupDir, BACKUP_IMAGES_DIR), { recursive: true });

  const dbContent = 'restored-db';
  await writeFile(join(backupDir, BACKUP_DB_FILENAME), dbContent);

  const files: Array<{ path: string; sha256: string; size: number }> = [
    {
      path: BACKUP_DB_FILENAME,
      sha256: sha256(dbContent),
      size: Buffer.byteLength(dbContent),
    },
  ];

  for (const image of options.images ?? []) {
    const imagePath = join(BACKUP_IMAGES_DIR, image.relPath);
    const fullPath = join(backupDir, imagePath);
    await mkdir(join(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, image.content);
    files.push({
      path: imagePath,
      sha256: sha256(image.content),
      size: Buffer.byteLength(image.content),
    });
  }

  const manifest: BackupManifest = {
    version: 1,
    electionId: 'e1',
    electionTitle: 'Test',
    electionDate: '2026-01-01',
    machineId: 'VX-001',
    softwareVersion: options.softwareVersion ?? 'dev',
    createdAt: '2026-01-01T00:00:00.000Z',
    files,
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  await writeFile(join(backupDir, MANIFEST_FILENAME), manifestJson);
  await writeFile(
    join(backupDir, MANIFEST_SIGNATURE_FILENAME),
    signManifest(manifestJson)
  );

  return backupDir;
}

describe('performRestore', () => {
  test('restores database and images to workspace', async () => {
    const mountPoint = makeTemporaryDirectory();
    await createBackup(mountPoint, 'test-backup', {
      images: [{ relPath: 'batch1/img.jpg', content: 'image-bytes' }],
    });

    const workspace = makeTemporaryDirectory();
    const logger = mockBaseLogger({ fn: vi.fn });

    const manifest = (
      await performRestore({
        workspacePath: workspace,
        dbPath: join(workspace, WORKSPACE_DB_FILENAME),
        ballotImagesPath: join(workspace, WORKSPACE_BALLOT_IMAGES_DIR),
        backupDriveMountPoint: mountPoint,
        backupDirectoryName: 'test-backup',
        softwareVersion: 'dev',
        logger,
      })
    ).unsafeUnwrap();

    expect(manifest.electionTitle).toEqual('Test');
    expect(
      (await stat(join(workspace, WORKSPACE_DB_FILENAME))).isFile()
    ).toEqual(true);
    expect(
      await readFile(join(workspace, WORKSPACE_DB_FILENAME), 'utf-8')
    ).toEqual('restored-db');
    expect(
      await readFile(
        join(workspace, WORKSPACE_BALLOT_IMAGES_DIR, 'batch1', 'img.jpg'),
        'utf-8'
      )
    ).toEqual('image-bytes');
  });

  test('rolls back on failure during copy', async () => {
    // Create a valid backup, then tamper with a file after validation
    // would pass but the copy-and-verify step will catch the mismatch
    const mountPoint = makeTemporaryDirectory();
    await createBackup(mountPoint, 'tampered-backup', {
      images: [{ relPath: 'batch1/img.jpg', content: 'good-data' }],
    });

    // Tamper with the image after the backup was created (validation
    // checks db first, so by the time it gets to the image the hash
    // won't match during the restore copy-verify step)
    const imgPath = join(
      mountPoint,
      BACKUP_ROOT_DIR,
      'tampered-backup',
      BACKUP_IMAGES_DIR,
      'batch1',
      'img.jpg'
    );
    await writeFile(imgPath, 'tampered-data');

    // Re-sign the manifest so signature validation passes but file
    // hash verification during restore will fail
    const backupDir = join(mountPoint, BACKUP_ROOT_DIR, 'tampered-backup');
    const manifestJson = await readFile(
      join(backupDir, MANIFEST_FILENAME),
      'utf-8'
    );
    await writeFile(
      join(backupDir, MANIFEST_SIGNATURE_FILENAME),
      signManifest(manifestJson)
    );

    const workspace = makeTemporaryDirectory();
    await writeFile(join(workspace, WORKSPACE_DB_FILENAME), 'original-db');
    const logger = mockBaseLogger({ fn: vi.fn });

    const result = await performRestore({
      workspacePath: workspace,
      dbPath: join(workspace, WORKSPACE_DB_FILENAME),
      ballotImagesPath: join(workspace, WORKSPACE_BALLOT_IMAGES_DIR),
      backupDriveMountPoint: mountPoint,
      backupDirectoryName: 'tampered-backup',
      softwareVersion: 'dev',
      logger,
    });
    if (result.isErr()) {
      expect(result.err().type).toEqual('invalidFileHash');
    } else {
      throw new Error('Expected performRestore to return an error');
    }
  });

  test('reports progress', async () => {
    const mountPoint = makeTemporaryDirectory();
    await createBackup(mountPoint, 'test-backup');

    const workspace = makeTemporaryDirectory();
    const logger = mockBaseLogger({ fn: vi.fn });
    const phases: string[] = [];

    (
      await performRestore({
        workspacePath: workspace,
        dbPath: join(workspace, WORKSPACE_DB_FILENAME),
        ballotImagesPath: join(workspace, WORKSPACE_BALLOT_IMAGES_DIR),
        backupDriveMountPoint: mountPoint,
        backupDirectoryName: 'test-backup',
        softwareVersion: 'dev',
        logger,
        onProgress: (progress) => {
          if (!phases.includes(progress.phase)) {
            phases.push(progress.phase);
          }
        },
      })
    ).unsafeUnwrap();

    expect(phases).toContain('preflight');
    expect(phases).toContain('copying');
    expect(phases).toContain('activating');
  });

  test('handles cancellation', async () => {
    const mountPoint = makeTemporaryDirectory();
    await createBackup(mountPoint, 'test-backup');

    const workspace = makeTemporaryDirectory();
    const logger = mockBaseLogger({ fn: vi.fn });

    const result = await performRestore({
      workspacePath: workspace,
      dbPath: join(workspace, WORKSPACE_DB_FILENAME),
      ballotImagesPath: join(workspace, WORKSPACE_BALLOT_IMAGES_DIR),
      backupDriveMountPoint: mountPoint,
      backupDirectoryName: 'test-backup',
      softwareVersion: 'dev',
      logger,
      signal: AbortSignal.abort(),
    });
    expect(result).toEqual(err({ type: 'cancelled' }));
  });

  test('returns cancelled result when cancellation happens during copy', async () => {
    const mountPoint = makeTemporaryDirectory();
    await createBackup(mountPoint, 'test-backup', {
      images: [{ relPath: 'batch1/img.jpg', content: 'image-data' }],
    });

    const workspace = makeTemporaryDirectory();
    const logger = mockBaseLogger({ fn: vi.fn });
    const controller = new AbortController();
    let cancelled = false;

    const result = await performRestore({
      workspacePath: workspace,
      dbPath: join(workspace, WORKSPACE_DB_FILENAME),
      ballotImagesPath: join(workspace, WORKSPACE_BALLOT_IMAGES_DIR),
      backupDriveMountPoint: mountPoint,
      backupDirectoryName: 'test-backup',
      softwareVersion: 'dev',
      logger,
      signal: controller.signal,
      onProgress: (progress) => {
        if (
          !cancelled &&
          progress.phase === 'copying' &&
          progress.filesCopied >= 1
        ) {
          cancelled = true;
          controller.abort();
        }
      },
    });

    expect(result).toEqual(err({ type: 'cancelled' }));
  });

  test('rejects missing backup directory', async () => {
    const mountPoint = makeTemporaryDirectory();
    const workspace = makeTemporaryDirectory();
    const logger = mockBaseLogger({ fn: vi.fn });

    await expect(
      performRestore({
        workspacePath: workspace,
        dbPath: join(workspace, WORKSPACE_DB_FILENAME),
        ballotImagesPath: join(workspace, WORKSPACE_BALLOT_IMAGES_DIR),
        backupDriveMountPoint: mountPoint,
        backupDirectoryName: 'nonexistent',
        softwareVersion: 'dev',
        logger,
      })
    ).rejects.toThrow('Backup directory not found');
  });
});
