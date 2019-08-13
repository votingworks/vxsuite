// Isolate the system exec from the rest of the code to make it easier to test.
//
// If we don't do this, and we mock exec(), other parts of the code,
// notably related to sqlite3, can't be imported at all, because
// they use exec under the covers.

import { execFile as systemExecFile, ChildProcess } from 'child_process'

const execFile = (
  file: string,
  args: string[],
  callback: (
    error: Error | null,
    stdout: string,
    stderr: string
  ) => void = () => {}
): ChildProcess => {
  return systemExecFile(file, args, callback)
}

export default execFile
