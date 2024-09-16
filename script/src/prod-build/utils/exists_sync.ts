import * as fs from 'node:fs';

export function existsSync(filename: string): boolean {
  try {
    fs.realpathSync(filename);
    return true;
  } catch {
    return false;
  }
}
