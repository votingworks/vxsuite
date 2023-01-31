import { Buffer } from 'buffer';
import * as temp from 'temp';

/**
 * Create a temporary file with `contents`, resolving to its path.
 */
export async function file(contents: string | Buffer): Promise<string> {
  const configFile = temp.createWriteStream();
  configFile.write(contents);
  await new Promise<void>((resolve) => {
    configFile.end(resolve);
  });
  return configFile.path as string;
}

/**
 * Create a temporary directory, resolving to its path.
 */
export async function dir(): Promise<string> {
  return temp.mkdir();
}
