import * as fs from 'fs';

export function existsSync(filename: string): boolean {
  try {
    fs.realpathSync(filename);
    return true;
  } catch {
    return false;
  }
}
