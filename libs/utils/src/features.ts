import { asBoolean } from './as_boolean';
import {
  BooleanEnvironmentVariableName,
  getEnvironmentVariable,
  getBooleanEnvVarConfig,
  isIntegrationTest,
} from './environment_variable';

export function isVxDev(): boolean {
  return asBoolean(process.env.REACT_APP_VX_DEV);
}

export function isFeatureFlagEnabled(
  flag: BooleanEnvironmentVariableName
): boolean {
  const flagInfo = getBooleanEnvVarConfig(flag);
  return (
    (flagInfo.allowInProduction ||
      process.env.NODE_ENV === 'development' ||
      isVxDev() ||
      isIntegrationTest()) &&
    asBoolean(getEnvironmentVariable(flag))
  );
}
