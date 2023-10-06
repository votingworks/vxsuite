import {
  ConverterClientType,
  ConverterClientTypeSchema,
  unsafeParse,
} from '@votingworks/types';
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

/**
 * Determines which converter client to use, if any.
 */
export function getConverterClientType(): ConverterClientType | undefined {
  const rawConverterClientType = process.env.REACT_APP_VX_CONVERTER;

  if (!rawConverterClientType) {
    return;
  }

  return unsafeParse(ConverterClientTypeSchema, rawConverterClientType);
}
