import * as fs from 'node:fs';

export function mkdirp(path: string): void {
  fs.mkdirSync(path, { recursive: true });
}
