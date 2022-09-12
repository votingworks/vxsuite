import { EnvironmentFlagName, getFlagDetails } from './environment_flag';

describe('environment flags', () => {
  it('gets flag details as expected', () => {
    for (const flag of Object.values(EnvironmentFlagName)) {
      const details = getFlagDetails(flag);
      expect(details.name).toBe(flag);
    }
  });
});
