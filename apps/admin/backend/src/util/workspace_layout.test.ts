import { expect, test } from 'vitest';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { exchangePaths } from '@votingworks/fs';
import { WorkspaceLayout } from './workspace_layout.js';

/**
 * Builds a workspace laid out the way every workspace was before the content
 * directory existed: database, ballot images, and election packages directly
 * in the root.
 */
function makeFlatWorkspace(): WorkspaceLayout {
  const root = makeTemporaryDirectory();
  writeFileSync(join(root, 'data.db'), 'database');
  mkdirSync(join(root, 'ballot-images', 'election-1'), { recursive: true });
  writeFileSync(join(root, 'ballot-images', 'election-1', 'front'), 'image');
  mkdirSync(join(root, 'election-packages'));
  writeFileSync(join(root, 'election-packages', 'package.zip'), 'package');
  return new WorkspaceLayout(root);
}

test('everything a restore replaces is inside the content directory', () => {
  const layout = new WorkspaceLayout(makeTemporaryDirectory());

  for (const path of [
    layout.dbPath,
    layout.ballotImagesPath,
    layout.electionPackagesPath,
  ]) {
    expect(relative(layout.contentPath, path).startsWith('..')).toEqual(false);
  }

  // ...and everything that has to survive one is not. A lock exchanged out
  // from under its holder locks nothing, and an in-progress restore cannot
  // live inside the directory it is going to replace.
  for (const path of [
    layout.backupStagingPath,
    layout.backupStagingLockPath,
    layout.incomingContentPath,
  ]) {
    expect(relative(layout.contentPath, path).startsWith('..')).toEqual(true);
    expect(relative(layout.root, path).startsWith('..')).toEqual(false);
  }
});

test('content can be replaced by an atomic exchange', () => {
  const layout = makeFlatWorkspace();
  layout.migrateContent();

  // What a restore does: build a whole replacement beside the live content,
  // then exchange the two. Both are inside the workspace, so they are always
  // on one filesystem and the exchange is always available.
  mkdirSync(layout.incomingContentPath);
  writeFileSync(
    join(layout.incomingContentPath, 'data.db'),
    'restored database'
  );

  exchangePaths(layout.contentPath, layout.incomingContentPath).unsafeUnwrap();

  expect(readFileSync(layout.dbPath, 'utf-8')).toEqual('restored database');
  // The workspace it replaced is what the exchange left behind, so a restore
  // has the old content in hand rather than having destroyed it.
  expect(
    readFileSync(join(layout.incomingContentPath, 'data.db'), 'utf-8')
  ).toEqual('database');
});

test('relativeToContent names a file the way a backup does', () => {
  const layout = new WorkspaceLayout(makeTemporaryDirectory());

  expect(layout.relativeToContent(layout.dbPath)).toEqual('data.db');
  expect(
    layout.relativeToContent(join(layout.ballotImagesPath, 'e1', 'front'))
  ).toEqual(join('ballot-images', 'e1', 'front'));
});

test('relativeToContent refuses a path outside the content directory', () => {
  const layout = new WorkspaceLayout(makeTemporaryDirectory());

  for (const path of [
    layout.backupStagingLockPath,
    join(layout.root, 'stray'),
    '/etc/passwd',
  ]) {
    expect(() => layout.relativeToContent(path)).toThrow(
      `${path} is not within ${layout.contentPath}`
    );
  }
});

test('migrateContent moves a flat workspace into the content directory', () => {
  const layout = makeFlatWorkspace();

  layout.migrateContent();

  expect(readFileSync(layout.dbPath, 'utf-8')).toEqual('database');
  expect(
    readFileSync(join(layout.ballotImagesPath, 'election-1', 'front'), 'utf-8')
  ).toEqual('image');
  expect(
    readFileSync(join(layout.electionPackagesPath, 'package.zip'), 'utf-8')
  ).toEqual('package');

  // Nothing left behind at the old locations to be mistaken for live data.
  expect(readdirSync(layout.root)).toEqual(['current']);
});

test('migrateContent takes the database sidecar files with it', () => {
  const layout = makeFlatWorkspace();
  // What a write killed mid-transaction leaves. Separating it from the
  // database it describes corrupts that database.
  writeFileSync(join(layout.root, 'data.db-journal'), 'journal');

  layout.migrateContent();

  expect(
    readFileSync(join(layout.contentPath, 'data.db-journal'), 'utf-8')
  ).toEqual('journal');
});

test('migrateContent leaves what belongs to the machine in the root', () => {
  const layout = makeFlatWorkspace();
  writeFileSync(layout.backupStagingLockPath, '');
  mkdirSync(layout.backupStagingPath);

  layout.migrateContent();

  expect(existsSync(layout.backupStagingLockPath)).toEqual(true);
  expect(existsSync(layout.backupStagingPath)).toEqual(true);
});

test('migrateContent does nothing to a workspace that is already migrated', () => {
  const layout = makeFlatWorkspace();
  layout.migrateContent();
  writeFileSync(layout.dbPath, 'changed since migrating');

  layout.migrateContent();

  expect(readFileSync(layout.dbPath, 'utf-8')).toEqual(
    'changed since migrating'
  );
});

test('migrateContent does nothing to a workspace that does not exist yet', () => {
  const layout = new WorkspaceLayout(
    join(makeTemporaryDirectory(), 'not-there')
  );

  layout.migrateContent();

  expect(existsSync(layout.root)).toEqual(false);
});

test('migrateContent creates nothing for a brand new workspace', () => {
  const layout = new WorkspaceLayout(makeTemporaryDirectory());

  layout.migrateContent();

  // Left for `createWorkspace` to populate: a migration that made the content
  // directory here would make an empty workspace indistinguishable from one
  // whose content was lost.
  expect(readdirSync(layout.root)).toEqual([]);
});

test('an interrupted migration is finished by the next one', () => {
  const layout = makeFlatWorkspace();
  const migratingPath = join(layout.root, 'migrating');

  // Killed after gathering the database but before the rest: the state a
  // migration is in for as long as it takes to move the files.
  mkdirSync(migratingPath);
  renameSync(join(layout.root, 'data.db'), join(migratingPath, 'data.db'));

  layout.migrateContent();

  expect(readFileSync(layout.dbPath, 'utf-8')).toEqual('database');
  expect(
    readFileSync(join(layout.ballotImagesPath, 'election-1', 'front'), 'utf-8')
  ).toEqual('image');
  expect(readdirSync(layout.root)).toEqual(['current']);
});

test('a migration killed before its final rename is finished by the next one', () => {
  const layout = makeFlatWorkspace();
  const migratingPath = join(layout.root, 'migrating');

  // Everything gathered, nothing yet moved into place.
  mkdirSync(migratingPath);
  for (const name of ['data.db', 'ballot-images', 'election-packages']) {
    renameSync(join(layout.root, name), join(migratingPath, name));
  }

  layout.migrateContent();

  expect(readFileSync(layout.dbPath, 'utf-8')).toEqual('database');
  expect(readdirSync(layout.root)).toEqual(['current']);
});
