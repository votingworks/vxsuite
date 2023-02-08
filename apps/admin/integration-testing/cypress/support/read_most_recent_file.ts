import { promises as fs } from 'fs';
import { join } from 'path';

export async function readMostRecentFile(directoryPath: string) {
  const files = await fs.readdir(directoryPath);
  const paths = files.map((file) => join(directoryPath, file));
  const ctimes = await Promise.all(
    paths.map(async (p) => (await fs.stat(p)).ctime.getTime())
  );
  const mostRecentCtime = Math.max(...ctimes);
  const mostRecentPath = paths[ctimes.indexOf(mostRecentCtime)];
  return await fs.readFile(mostRecentPath, 'utf-8');
}
