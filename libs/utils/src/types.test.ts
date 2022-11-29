import { ReportSourceMachineType } from './types';

// Enums act weirdly with jest coverage, this is needed to get to 100% coverage
test('ReportSourceMachineType', () => {
  expect(Object.values(ReportSourceMachineType)).toHaveLength(1);
});
