/* istanbul ignore file: a re-export, exercised through everything that uses it */

// Isolates the filesystem operations the backup engine performs, so that a test
// can make an individual one fail. `vi.spyOn` cannot replace an export of a core
// module under ESM, and mocking `node:fs/promises` wholesale means every caller
// in the module graph gets the stand-in; mocking this module reaches only the
// backup code. `libs/backend` and `libs/usb-drive` isolate `execFile` the same
// way and for the same reason.

export {
  constants,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
export { createReadStream, createWriteStream } from 'node:fs';
