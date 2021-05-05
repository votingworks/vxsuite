import { TallySourceMachineType } from './types'

// Enums act weirdly with jest coverage, this is needed to get to 100% coverage
test('TallySourceMachineType', () => {
  expect(Object.values(TallySourceMachineType)).toHaveLength(2)
})
