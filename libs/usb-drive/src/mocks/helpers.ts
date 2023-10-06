import { execSync } from 'child_process';
import { join } from 'path';
import { mkdirSync, writeFileSync, cpSync } from 'fs';
import { Buffer } from 'buffer';

export type ActualDirectory = string;
export type MockFile = Buffer;
export interface MockDirectory {
  [name: string]: MockFileTree;
}
export type MockFileTree = MockFile | MockDirectory | ActualDirectory;

export function writeMockFileTree(
  destinationPath: string,
  tree: MockFileTree
): void {
  if (Buffer.isBuffer(tree)) {
    writeFileSync(destinationPath, tree);
  } else if (typeof tree === 'string') {
    cpSync(tree, destinationPath, { recursive: true });
  } else {
    mkdirSync(destinationPath, { recursive: true });
    for (const [name, child] of Object.entries(tree)) {
      // Sleep 1ms to ensure that each file is created with a distinct timestamp
      execSync('sleep 0.01');
      writeMockFileTree(join(destinationPath, name), child);
    }
  }
}

export const TMP_DIR_PREFIX = 'mock-usb-drive-';
