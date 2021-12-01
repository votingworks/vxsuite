import * as fs from 'fs';

export function mkdirp(path: string): void {
  fs.mkdirSync(path, { recursive: true });
}
