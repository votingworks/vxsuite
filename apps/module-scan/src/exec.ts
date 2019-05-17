// Isolate the system exec from the rest of the code to make it easier to test.
//
// If we don't do this, and we mock exec(), other parts of the code,
// notably related to sqlite3, can't be imported at all, because
// they use exec under the covers.

import { exec as systemExec, ExecException, ChildProcess } from 'child_process'

const exec = (
  command: string,
  callback?: (
    error: ExecException | null,
    stdout: string,
    stderr: string
  ) => void
): ChildProcess => {
  return systemExec(command, callback)
}

export default exec
