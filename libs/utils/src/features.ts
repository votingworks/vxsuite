import { asBoolean } from './as_boolean';
import {
  EnvironmentFlagName,
  getFlag,
  getFlagDetails,
} from './environment_flag';

export function isVxDev(): boolean {
  return asBoolean(process.env.REACT_APP_VX_DEV);
}

export function isFeatureFlagEnabled(flag: EnvironmentFlagName): boolean {
  const flagInfo = getFlagDetails(flag);
  return (
    (flagInfo.allowInProduction ||
      process.env.NODE_ENV === 'development' ||
      isVxDev()) &&
    asBoolean(getFlag(flag))
  );
}
