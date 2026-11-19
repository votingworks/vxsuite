import fs from 'node:fs/promises';

const ROBOTO_BOLD_PATH = `${import.meta.dirname}/fonts/Roboto-Bold.ttf`;

let robotoBoldCache: Promise<Uint8Array> | undefined;

export function getRobotoBoldData(): Promise<Uint8Array> {
  if (!robotoBoldCache) robotoBoldCache = fs.readFile(ROBOTO_BOLD_PATH);
  return robotoBoldCache;
}
