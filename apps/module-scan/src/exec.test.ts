import { execFile as systemExecFile } from 'child_process'
import execFile from './exec'

jest.mock('child_process')

test('execFile wrapper calls execFile', () => {
  execFile('ls', [])
  expect(systemExecFile).toHaveBeenCalled()
})
