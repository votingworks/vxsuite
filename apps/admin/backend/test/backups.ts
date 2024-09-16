import { cpSync, emptyDirSync, ensureDirSync, existsSync } from 'fs-extra';
import { join } from 'node:path';
import tmp from 'tmp';
import { Workspace } from '../src/util/workspace';
import { deleteTmpFileAfterTestSuiteCompletes } from './cleanup';

export const WORKSPACE_BACKUPS_DIR = join(__dirname, '..', 'workspace-backups');

export interface MakeTestWorkspaceBackupParams {
  workspace: Workspace;
  backupName: string;
  overwrite?: boolean;
}

/**
 * Use for backing up workspaces from tests. Useful when you need to run
 * repeated tests with a workspace that takes too much time to create.
 */
export function takeBackup({
  workspace,
  backupName,
  overwrite,
}: MakeTestWorkspaceBackupParams): void {
  ensureDirSync(WORKSPACE_BACKUPS_DIR);
  const backupDir = join(WORKSPACE_BACKUPS_DIR, backupName);

  if (existsSync(backupDir) && !overwrite) return;

  emptyDirSync(backupDir);
  cpSync(workspace.path, backupDir, { recursive: true });
}

/**
 * Return a path to a temporary copy of a backup, specified by id.
 */
export function getBackupPath(backupName: string): string {
  const backupPath = join(WORKSPACE_BACKUPS_DIR, backupName);
  const tmpBackupPath = tmp.dirSync().name;

  cpSync(backupPath, tmpBackupPath, { recursive: true });
  deleteTmpFileAfterTestSuiteCompletes(tmpBackupPath);
  return tmpBackupPath;
}
