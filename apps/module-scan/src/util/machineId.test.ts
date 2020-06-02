import { getMachineId } from './machineId'

beforeEach(() => {
  delete process.env.VX_MACHINE_ID
})

test('uses the value of VX_MACHINE_ID if present', () => {
  process.env.VX_MACHINE_ID = '098'
  expect(getMachineId()).toEqual('098')
})

test('defaults to 000 if no value is set', () => {
  expect(getMachineId()).toEqual('000')
})
