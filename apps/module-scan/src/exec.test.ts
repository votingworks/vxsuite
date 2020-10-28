import { execFile } from 'child_process'
import { streamExecFile } from './exec'

jest.mock('child_process')

test('streamExecFile wrapper calls execFile', () => {
  streamExecFile('ls', [])
  expect(execFile).toHaveBeenCalled()
})
