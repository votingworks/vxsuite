import { promises as fs } from 'fs';
import { join } from 'path';

export async function readdir(directory: string): Promise<string[]> {
  return (await fs.readdir(directory)).map((entry) => join(directory, entry));
}
