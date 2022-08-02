declare namespace NodeJS {
  export interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly REACT_APP_VX_DEV?: string;
    readonly REACT_APP_VX_DISABLE_CARD_READER_CHECK?: string;
    readonly REACT_APP_VX_ENABLE_ALL_ZERO_SMARTCARD_PIN_GENERATION?: string;
    readonly REACT_APP_VX_ENABLE_VVSG2_AUTH_FLOWS?: string;
  }
}
