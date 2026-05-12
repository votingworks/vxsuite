import { randomBytes } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { Side } from '@votingworks/types';

import { performBackup } from '../backup';
import { BackupProgress, BACKUP_IMAGES_DIR } from '../types';
import {
  backupAndValidate,
  createBackupContext,
  createPopulatedWorkspace,
  verifyRoundTrip,
} from './workspace_factory';

const ELECTION_DEFINITION_ID = 'election-general';

describe('scale', () => {
  test('round-trip with 10 images', { timeout: 30_000 }, async () => {
    const workspace = createPopulatedWorkspace({
      batchCount: 2,
      cvrsPerBatch: 5,
      imagesPerCvr: 1,
    });
    expect(workspace.totalImages).toEqual(10);

    const mountPoint = makeTemporaryDirectory();
    const { manifest, backupDirName } = await backupAndValidate(
      workspace,
      mountPoint
    );

    expect(manifest.files).toHaveLength(11);
    const imageFiles = manifest.files.filter((f) =>
      f.path.startsWith(BACKUP_IMAGES_DIR)
    );
    expect(imageFiles).toHaveLength(10);

    await verifyRoundTrip(workspace, mountPoint, backupDirName);
  });

  test('round-trip with 100 images', { timeout: 60_000 }, async () => {
    const workspace = createPopulatedWorkspace({
      batchCount: 10,
      cvrsPerBatch: 10,
      imagesPerCvr: 1,
    });
    expect(workspace.totalImages).toEqual(100);

    const mountPoint = makeTemporaryDirectory();
    const imagesCopiedValues: number[] = [];

    const ctx = createBackupContext(workspace, mountPoint, {
      onProgress(progress: BackupProgress) {
        if (progress.phase === 'images') {
          imagesCopiedValues.push(progress.imagesCopied);
        }
      },
    });

    (await performBackup(ctx)).unsafeUnwrap();

    const { backupDirName } = await backupAndValidate(workspace, mountPoint);
    await verifyRoundTrip(workspace, mountPoint, backupDirName);

    expect(imagesCopiedValues[imagesCopiedValues.length - 1]).toEqual(100);
  });

  test('round-trip with 500 images', { timeout: 120_000 }, async () => {
    const workspace = createPopulatedWorkspace({
      batchCount: 10,
      cvrsPerBatch: 25,
      imagesPerCvr: 2,
      imageSizeRange: [500, 2000],
    });
    expect(workspace.totalImages).toEqual(500);

    const mountPoint = makeTemporaryDirectory();
    const { manifest, backupDirName } = await backupAndValidate(
      workspace,
      mountPoint
    );

    expect(manifest.files).toHaveLength(501);
    await verifyRoundTrip(workspace, mountPoint, backupDirName);
  });

  test(
    'deduplication: second backup reuses images from first',
    { timeout: 60_000 },
    async () => {
      const workspace = createPopulatedWorkspace({
        batchCount: 5,
        cvrsPerBatch: 10,
        imagesPerCvr: 1,
      });
      expect(workspace.totalImages).toEqual(50);

      const mountPoint = makeTemporaryDirectory();

      // First backup
      await backupAndValidate(workspace, mountPoint);

      // Add 10 more images to the workspace
      const { store, electionId } = workspace;
      const newBatchId = 'batch-extra';
      store.addScannerBatch({
        batchId: newBatchId,
        label: 'Batch Extra',
        scannerId: 'scanner-1',
        electionId,
        startedAt: new Date().toISOString(),
      });

      const precinctIds = ['23', '21', '20'];
      const ballotStyleGroupIds = ['1', '2', '3', '4', '5'];

      for (let i = 0; i < 10; i += 1) {
        const ballotId = `ballot-extra-${i}`;
        const precinctId = precinctIds[i % precinctIds.length]!;
        const ballotStyleGroupId = ballotStyleGroupIds[
          i % ballotStyleGroupIds.length
        ]!;

        const { cvrId } = store
          .addCastVoteRecordFileEntry({
            electionId,
            cvrFileId: 'cvr-file-1',
            ballotId,
            cvr: {
              ballotStyleGroupId,
              batchId: newBatchId,
              precinctId,
              votingMethod: 'precinct',
              card: { type: 'bmd' },
              votes: {},
            },
            adjudicationFlags: {
              isBlank: false,
              hasOvervote: false,
              hasUndervote: false,
              hasWriteIn: false,
            },
          })
          .unsafeUnwrap();

        store.addBallotImage({
          cvrId,
          electionDefinitionId: ELECTION_DEFINITION_ID,
          imageData: randomBytes(1000),
          side: 'front' as Side,
        });
      }

      // Second backup
      const { manifest } = await backupAndValidate(workspace, mountPoint);

      // 60 images + 1 database
      expect(manifest.files).toHaveLength(61);
    }
  );

  test('progress callbacks fire in correct order with correct counts', async () => {
    const workspace = createPopulatedWorkspace({
      batchCount: 4,
      cvrsPerBatch: 5,
      imagesPerCvr: 1,
    });
    expect(workspace.totalImages).toEqual(20);

    const mountPoint = makeTemporaryDirectory();
    const progressCalls: BackupProgress[] = [];

    const ctx = createBackupContext(workspace, mountPoint, {
      onProgress(progress: BackupProgress) {
        progressCalls.push(progress);
      },
    });

    (await performBackup(ctx)).unsafeUnwrap();

    // Verify phases appear in the correct order
    const phases = progressCalls.map((p) => p.phase);
    const uniquePhases = [...new Set(phases)];
    const expectedOrder = [
      'preflight',
      'snapshot',
      'images',
      'signing',
      'validating',
    ];
    expect(uniquePhases).toEqual(expectedOrder);

    // Verify images phase has correct counts
    const imageProgressCalls = progressCalls.filter(
      (p) => p.phase === 'images'
    );
    expect(imageProgressCalls.length).toBeGreaterThanOrEqual(1);

    for (const p of imageProgressCalls) {
      expect(p.imagesTotal).toEqual(20);
    }

    const lastImageProgress =
      imageProgressCalls[imageProgressCalls.length - 1]!;
    expect(lastImageProgress.imagesCopied).toEqual(20);
  });
});
