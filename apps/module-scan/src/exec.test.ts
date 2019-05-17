import { exec as systemExec } from 'child_process'
import exec from './exec'

jest.mock('child_process')

test('exec wrapper calls exec', () => {
  exec('ls')
  expect(systemExec).toHaveBeenCalled()
})
