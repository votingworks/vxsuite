import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export async function readdir(directory: string): Promise<string[]> {
  return (await fs.readdir(directory)).map((entry) => join(directory, entry));
}
