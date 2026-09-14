import { vi } from 'vitest';
import { ok } from '@votingworks/basics';

/**
 * `@votingworks/fs` with `syncFilesystem` stubbed out to succeed without doing
 * anything: `syncfs(2)` flushes the whole filesystem, so calling it for real
 * blocks on every other test worker's writes for an unbounded time.
 */
export async function mockFs(): Promise<typeof import('@votingworks/fs')> {
  const actual =
    await vi.importActual<typeof import('@votingworks/fs')>('@votingworks/fs');
  return {
    ...actual,
    syncFilesystem: vi.fn<typeof actual.syncFilesystem>(() =>
      Promise.resolve(ok())
    ),
  };
}
