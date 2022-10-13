import { throwIllegalValue } from './assert';

export enum EnvironmentFlagName {
  // Enables the write in adjudication tab in VxAdmin, and enables exporting images with write ins in the scan service
  WRITE_IN_ADJUDICATION = 'REACT_APP_VX_ENABLE_WRITE_IN_ADJUDICATION',
  // When enabled VxAdmin will generate 000000 as the PIN for any created smartcard.
  ALL_ZERO_SMARTCARD_PIN = 'REACT_APP_VX_ENABLE_ALL_ZERO_SMARTCARD_PIN_GENERATION',
  // When enabled the "You must connect a card reader" screens will not appear throughout all apps.
  DISABLE_CARD_READER_CHECK = 'REACT_APP_VX_DISABLE_CARD_READER_CHECK',
  // Enables livecheck in VxScan.
  LIVECHECK = 'REACT_APP_VX_ENABLE_LIVECHECK',
  // Whether overvotes can be cast (this exists entirely for NH special case right now).
  DISALLOW_CASTING_OVERVOTES = 'REACT_APP_VX_DISALLOW_CASTING_OVERVOTES',
  // Enables the React Query Devtools in development.
  ENABLE_REACT_QUERY_DEVTOOLS = 'REACT_APP_VX_ENABLE_REACT_QUERY_DEVTOOLS',
  // Skips PIN entry during authentication
  SKIP_PIN_ENTRY = 'REACT_APP_VX_SKIP_PIN_ENTRY',
}

export interface EnvironmentFlag {
  name: EnvironmentFlagName;
  // When false this flag will never be enabled when NODE_ENV is production.
  allowInProduction: boolean;
  // When true the script that generates .env files will turn this flag on by default.
  autoEnableInDevelopment: boolean;
}

export function getFlag(name: EnvironmentFlagName): string | undefined {
  switch (name) {
    case EnvironmentFlagName.WRITE_IN_ADJUDICATION:
      return process.env.REACT_APP_VX_ENABLE_WRITE_IN_ADJUDICATION;
    case EnvironmentFlagName.ALL_ZERO_SMARTCARD_PIN:
      return process.env.REACT_APP_VX_ENABLE_ALL_ZERO_SMARTCARD_PIN_GENERATION;
    case EnvironmentFlagName.DISABLE_CARD_READER_CHECK:
      return process.env.REACT_APP_VX_DISABLE_CARD_READER_CHECK;
    case EnvironmentFlagName.LIVECHECK:
      return process.env.REACT_APP_VX_ENABLE_LIVECHECK;
    case EnvironmentFlagName.DISALLOW_CASTING_OVERVOTES:
      return process.env.REACT_APP_VX_DISALLOW_CASTING_OVERVOTES;
    case EnvironmentFlagName.ENABLE_REACT_QUERY_DEVTOOLS:
      return process.env.REACT_APP_VX_ENABLE_REACT_QUERY_DEVTOOLS;
    case EnvironmentFlagName.SKIP_PIN_ENTRY:
      return process.env.REACT_APP_VX_SKIP_PIN_ENTRY;
    /* istanbul ignore next compile time check */
    default:
      throwIllegalValue(name);
  }
}

export function getFlagDetails(name: EnvironmentFlagName): EnvironmentFlag {
  switch (name) {
    case EnvironmentFlagName.WRITE_IN_ADJUDICATION:
      return {
        name,
        allowInProduction: true,
        autoEnableInDevelopment: true,
      };
    case EnvironmentFlagName.ALL_ZERO_SMARTCARD_PIN:
      return {
        name,
        allowInProduction: false,
        autoEnableInDevelopment: true,
      };
    case EnvironmentFlagName.DISABLE_CARD_READER_CHECK:
      return {
        name,
        allowInProduction: false,
        autoEnableInDevelopment: false,
      };
    case EnvironmentFlagName.LIVECHECK:
      return {
        name,
        allowInProduction: false,
        autoEnableInDevelopment: true,
      };
    case EnvironmentFlagName.DISALLOW_CASTING_OVERVOTES:
      return {
        name,
        allowInProduction: true,
        autoEnableInDevelopment: false,
      };
    case EnvironmentFlagName.ENABLE_REACT_QUERY_DEVTOOLS:
      return {
        name,
        allowInProduction: false,
        autoEnableInDevelopment: false,
      };
    case EnvironmentFlagName.SKIP_PIN_ENTRY:
      return {
        name,
        allowInProduction: false,
        autoEnableInDevelopment: false,
      };
    /* istanbul ignore next compile time check */
    default:
      throwIllegalValue(name);
  }
}
