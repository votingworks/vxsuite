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
}

export interface EnvironmentFlag {
  name: EnvironmentFlagName;
  // When false this flag will never be enabled when NODE_ENV is production.
  allowInProduction: boolean;
  // When true the script that generates .env files will turn this flag on by default.
  autoEnableInDevelopment: boolean;
}

export function getFlagDetails(name: EnvironmentFlagName): EnvironmentFlag {
  switch (name) {
    case EnvironmentFlagName.WRITE_IN_ADJUDICATION:
      return {
        name,
        allowInProduction: false,
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
    /* istanbul ignore next compile time check */
    default:
      throwIllegalValue(name);
  }
}
