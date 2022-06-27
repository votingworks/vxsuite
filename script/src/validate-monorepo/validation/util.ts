import { promises as fs } from 'fs';
import { join } from 'path';

export interface Package {
  readonly name: string;
  readonly dependencies?: { [name: string]: string };
  readonly devDependencies?: { [name: string]: string };
  readonly peerDependencies?: { [name: string]: string };
  readonly packageManager?: string;
}

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}

export async function readdir(directory: string): Promise<string[]> {
  return (await fs.readdir(directory)).map((entry) => join(directory, entry));
}

export async function maybeReadPackageJson(
  filepath: string
): Promise<Package | undefined> {
  return await maybeReadJson(filepath);
}

export async function maybeReadJson(
  filepath: string
): Promise<any | undefined> {
  try {
    return JSON.parse(await fs.readFile(filepath, { encoding: 'utf-8' }));
  } catch {
    return undefined;
  }
}
