import { appendFile, copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { assert } from '@votingworks/basics';

/** Collects a recording streamed from the frontend in chunks into a temp file. */
export class ScreenRecordingFile {
  private path?: string;

  async begin(): Promise<void> {
    await this.discard();
    const dir = await mkdtemp(join(tmpdir(), 'dev-dock-recording-'));
    this.path = join(dir, 'recording');
    await writeFile(this.path, new Uint8Array());
  }

  async append(data: Uint8Array): Promise<void> {
    assert(this.path !== undefined);
    await appendFile(this.path, data);
  }

  async save(destinationPath: string): Promise<void> {
    assert(this.path !== undefined);
    await copyFile(this.path, destinationPath);
    await this.discard();
  }

  async discard(): Promise<void> {
    if (this.path === undefined) return;
    await rm(dirname(this.path), { recursive: true, force: true });
    this.path = undefined;
  }
}
